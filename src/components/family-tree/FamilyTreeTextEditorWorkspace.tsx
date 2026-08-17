import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../ui/Button";
import BeatDocumentEditorView, {
  type BeatDocumentEditorHandle,
} from "../timeline/beatEditor/BeatDocumentEditorView";
import {
  insertPersonDeclarationAtCursor,
  insertUnionBlockAtCursor,
  previewFamilyDocumentDeleteCounts,
} from "../../store/familyTreeDocumentHelpers";
import {
  BEAT_TEXT_SCALE_PERCENT_MAX,
  BEAT_TEXT_SCALE_PERCENT_MIN,
} from "../../store/timelineTypes";
import { useFamilyTreeStore } from "../../store/familyTreeStore";

export interface TextEditorDrafts {
  [docId: string]: { content: string; dirty: boolean };
}

export interface TextEditorPane {
  paneId: string;
  docId: string | null;
}

const UNIFORM_PANE_WIDTH_MIN = 240;
const UNIFORM_PANE_WIDTH_MAX = 1200;

interface FamilyTreeTextEditorWorkspaceProps {
  drafts: TextEditorDrafts;
  onDraftsChange: (drafts: TextEditorDrafts) => void;
  panes: TextEditorPane[];
  onPanesChange: (panes: TextEditorPane[]) => void;
  activePaneId: string | null;
  onActivePaneIdChange: (id: string | null) => void;
  unifiedScroll: boolean;
  onUnifiedScrollChange: (v: boolean) => void;
  paneFractions: number[];
  onPaneFractionsChange: (fractions: number[]) => void;
  uniformPaneWidth: boolean;
  onUniformPaneWidthChange: (v: boolean) => void;
  uniformPaneWidthPx: number;
  onUniformPaneWidthPxChange: (px: number) => void;
  textScalePercent: number;
  onTextScalePercentChange: (pct: number) => void;
  onRequestFileDeleteConfirm: (payload: {
    docId: string;
    paneId: string;
    fileName: string;
    personCount: number;
    unionCount: number;
  }) => void;
}

export default function FamilyTreeTextEditorWorkspace({
  drafts,
  onDraftsChange,
  panes,
  onPanesChange,
  activePaneId,
  onActivePaneIdChange,
  unifiedScroll,
  onUnifiedScrollChange,
  paneFractions,
  onPaneFractionsChange,
  uniformPaneWidth,
  onUniformPaneWidthChange,
  uniformPaneWidthPx,
  onUniformPaneWidthPxChange,
  textScalePercent,
  onTextScalePercentChange,
  onRequestFileDeleteConfirm,
}: FamilyTreeTextEditorWorkspaceProps) {
  const documents = useFamilyTreeStore((s) => s.documents);
  const setDirtyDocumentIds = useFamilyTreeStore((s) => s.setDirtyDocumentIds);
  const createFamilyDocument = useFamilyTreeStore((s) => s.createFamilyDocument);
  const applyFamilyDocumentEdits = useFamilyTreeStore((s) => s.applyFamilyDocumentEdits);
  const renameFamilyDocument = useFamilyTreeStore((s) => s.renameFamilyDocument);
  const getDocumentDisplayContent = useFamilyTreeStore((s) => s.getDocumentDisplayContent);
  const activeFamilyTabId = useFamilyTreeStore((s) => s.activeFamilyTabId);

  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const editorRefs = useRef<Map<string, BeatDocumentEditorHandle | null>>(new Map());
  const paneRowRef = useRef<HTMLDivElement>(null);

  const activePane = activePaneId ? panes.find((p) => p.paneId === activePaneId) ?? null : null;
  const activeFileId = activePane?.docId ?? null;
  const activeDoc = activeFileId ? documents.find((d) => d.id === activeFileId) ?? null : null;
  const activeDraft = activeFileId ? drafts[activeFileId] : null;
  const activeDirty = activeDraft?.dirty ?? false;

  const getDocContent = useCallback(
    (docId: string): string => {
      const draft = drafts[docId];
      if (draft?.dirty) return draft.content;
      return getDocumentDisplayContent(docId);
    },
    [drafts, getDocumentDisplayContent]
  );

  useEffect(() => {
    const dirtyIds = Object.entries(drafts)
      .filter(([, d]) => d.dirty)
      .map(([id]) => id);
    setDirtyDocumentIds(dirtyIds);
  }, [drafts, setDirtyDocumentIds]);

  const setContent = useCallback(
    (docId: string, content: string) => {
      onDraftsChange({
        ...drafts,
        [docId]: { content, dirty: true },
      });
      setParseErrors([]);
    },
    [drafts, onDraftsChange]
  );

  const commitInsertToModel = useCallback(
    (docId: string, content: string, cursorPos: number): boolean => {
      const result = applyFamilyDocumentEdits([{ docId, content }]);
      if (!result.ok) {
        setParseErrors(result.errors);
        return false;
      }
      setParseErrors([]);
      onDraftsChange({
        ...drafts,
        [docId]: { content, dirty: false },
      });
      editorRefs.current.get(docId)?.setContentWithCursor(content, cursorPos);
      return true;
    },
    [drafts, onDraftsChange, applyFamilyDocumentEdits]
  );

  const removePaneById = (paneId: string) => {
    const next = panes.filter((p) => p.paneId !== paneId);
    onPanesChange(next);
    if (activePaneId === paneId) {
      onActivePaneIdChange(next[0]?.paneId ?? null);
    }
  };

  const handleClosePane = (paneId: string) => removePaneById(paneId);

  const handleOpenInNewPane = () => {
    const paneId = crypto.randomUUID();
    onPanesChange([...panes, { paneId, docId: null }]);
    onActivePaneIdChange(paneId);
  };

  const handleNewFile = () => {
    const id = createFamilyDocument("Untitled", activeFamilyTabId);
    if (activePaneId) {
      onPanesChange(
        panes.map((p) => (p.paneId === activePaneId ? { ...p, docId: id } : p))
      );
      return;
    }
    const paneId = crypto.randomUUID();
    onPanesChange([...panes, { paneId, docId: id }]);
    onActivePaneIdChange(paneId);
  };

  const handleInsertPerson = () => {
    if (!activeFileId) return;
    const content = getDocContent(activeFileId);
    const handle = editorRefs.current.get(activeFileId);
    const cursorPos = handle?.getCursorPos() ?? content.length;
    const result = insertPersonDeclarationAtCursor(content, cursorPos);
    if (!result.ok) {
      setParseErrors([result.error]);
      return;
    }
    commitInsertToModel(activeFileId, result.content, result.cursorPos);
  };

  const handleInsertUnion = () => {
    if (!activeFileId) return;
    const content = getDocContent(activeFileId);
    const handle = editorRefs.current.get(activeFileId);
    const cursorPos = handle?.getCursorPos() ?? content.length;
    const result = insertUnionBlockAtCursor(content, cursorPos);
    if (!result.ok) {
      setParseErrors([result.error]);
      return;
    }
    commitInsertToModel(activeFileId, result.content, result.cursorPos);
  };

  const handleDeleteFile = () => {
    if (!activeFileId || !activeDoc || !activePane) return;
    const content = getDocContent(activeFileId);
    const { personCount, unionCount } = previewFamilyDocumentDeleteCounts(content);
    onRequestFileDeleteConfirm({
      docId: activeFileId,
      paneId: activePane.paneId,
      fileName: activeDoc.name,
      personCount,
      unionCount,
    });
  };

  const handleExpandAllPanes = () => {
    if (panes.length === 0) return;
    onUniformPaneWidthChange(false);
    onPaneFractionsChange(panes.map(() => 1 / panes.length));
  };

  const clampUniformWidth = (px: number) =>
    Math.min(UNIFORM_PANE_WIDTH_MAX, Math.max(UNIFORM_PANE_WIDTH_MIN, px));

  const handleDividerPointerDown = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    if (uniformPaneWidth) {
      const startX = e.clientX;
      const startWidth = uniformPaneWidthPx;
      const onMove = (ev: PointerEvent) => {
        onUniformPaneWidthPxChange(clampUniformWidth(startWidth + (ev.clientX - startX)));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      return;
    }
    const startX = e.clientX;
    const startFractions = [...paneFractions];
    const container = e.currentTarget.parentElement?.parentElement as HTMLElement | null;
    if (!container) return;
    const width = container.getBoundingClientRect().width;
    const onMove = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) / width;
      const next = [...startFractions];
      const left = Math.max(0.15, Math.min(0.85, startFractions[index]! + delta));
      const rightOrig = startFractions[index]! + startFractions[index + 1]!;
      next[index] = left;
      next[index + 1] = Math.max(0.15, rightOrig - left);
      const sum = next.reduce((a, b) => a + b, 0);
      onPaneFractionsChange(next.map((f) => f / sum));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  useEffect(() => {
    const n = panes.length;
    if (n === 0) return;
    if (paneFractions.length !== n) {
      onPaneFractionsChange(Array.from({ length: n }, () => 1 / n));
    }
  }, [panes.length, paneFractions.length, onPaneFractionsChange]);

  const renderEditor = (docId: string, content: string) => (
    <BeatDocumentEditorView
      key={docId}
      ref={(handle) => {
        editorRefs.current.set(docId, handle);
      }}
      content={content}
      onChange={(text) => setContent(docId, text)}
      separatorsCommitted={true}
      fontSizePercent={textScalePercent}
    />
  );

  const getDocForPane = (pane: TextEditorPane) =>
    pane.docId ? documents.find((d) => d.id === pane.docId) ?? null : null;

  const commitRename = (docId: string) => {
    renameFamilyDocument(docId, renameValue);
    setRenamingDocId(null);
  };

  const renderFileNameHeader = (
    doc: { id: string; name: string } | null,
    isActive: boolean,
    dirtySuffix: React.ReactNode
  ) => {
    if (!doc) return "Empty pane";
    if (renamingDocId === doc.id) {
      return (
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => commitRename(doc.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename(doc.id);
            if (e.key === "Escape") setRenamingDocId(null);
          }}
          className="flex-1 min-w-0 px-1 py-0.5 text-xs bg-dark-bg border border-blue-500/50 rounded text-dark-text"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      );
    }
    return (
      <>
        <span
          className="flex-1 truncate"
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (!isActive) return;
            setRenamingDocId(doc.id);
            setRenameValue(doc.name);
          }}
        >
          {doc.name}
        </span>
        {dirtySuffix}
      </>
    );
  };

  const renderPaneCloseButton = (paneId: string) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleClosePane(paneId);
      }}
      className="flex-shrink-0 px-1.5 py-0.5 text-dark-muted hover:text-dark-text rounded hover:bg-dark-accent/40"
      title="Close pane"
      aria-label="Close pane"
    >
      ×
    </button>
  );

  const renderEmptyPaneBody = () => (
    <div className="flex-1 min-h-0 flex items-center justify-center text-dark-muted text-sm px-4 text-center">
      Empty pane — click a file in Sub Entities to load it here
    </div>
  );

  const renderSideBySidePane = (pane: TextEditorPane, index: number) => {
    const doc = getDocForPane(pane);
    const isActive = pane.paneId === activePaneId;
    const frac = paneFractions[index] ?? 1 / panes.length;
    const content = pane.docId ? getDocContent(pane.docId) : "";
    const paneStyle = uniformPaneWidth
      ? { width: uniformPaneWidthPx, flexShrink: 0 }
      : { flex: frac };

    return (
      <div key={pane.paneId} className="flex min-h-0 min-w-0" style={paneStyle}>
        <div
          className={`flex-1 min-w-0 min-h-0 flex flex-col ${
            isActive ? "ring-1 ring-inset ring-blue-500/50" : ""
          }`}
          onFocusCapture={() => onActivePaneIdChange(pane.paneId)}
          onPointerDown={() => onActivePaneIdChange(pane.paneId)}
        >
          <div className="px-2 py-1 text-xs text-dark-muted border-b border-dark-accent/30 flex items-center gap-1 min-w-0">
            {renderFileNameHeader(
              doc,
              isActive,
              pane.docId && drafts[pane.docId]?.dirty ? " •" : null
            )}
            {renderPaneCloseButton(pane.paneId)}
          </div>
          <div className="flex-1 min-h-0 p-2">
            {pane.docId && doc ? renderEditor(pane.docId, content) : renderEmptyPaneBody()}
          </div>
        </div>
        {index < panes.length - 1 && (
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(e) => handleDividerPointerDown(index, e)}
            className="w-1.5 flex-shrink-0 cursor-col-resize bg-dark-accent/20 hover:bg-dark-accent/50"
          />
        )}
      </div>
    );
  };

  const renderUnifiedSection = (pane: TextEditorPane) => {
    const doc = getDocForPane(pane);
    const isActive = pane.paneId === activePaneId;
    const content = pane.docId ? getDocContent(pane.docId) : "";

    return (
      <div
        key={pane.paneId}
        className={`border-b border-dark-accent/40 ${isActive ? "bg-blue-500/5" : ""}`}
        onFocusCapture={() => onActivePaneIdChange(pane.paneId)}
        onPointerDown={() => onActivePaneIdChange(pane.paneId)}
      >
        <div className="px-3 py-1.5 text-xs font-medium text-dark-muted uppercase tracking-wide border-b border-dark-accent/30 sticky top-0 bg-dark-surface z-10 flex items-center gap-2 min-w-0">
          {renderFileNameHeader(
            doc,
            isActive,
            pane.docId && drafts[pane.docId]?.dirty ? " · Unsaved" : null
          )}
          {renderPaneCloseButton(pane.paneId)}
        </div>
        <div className="min-h-[280px] h-[40vh] px-3 pb-3 pt-2">
          {pane.docId && doc ? renderEditor(pane.docId, content) : renderEmptyPaneBody()}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-dark-surface">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-accent/50 flex-wrap">
        <span className="text-sm font-medium text-dark-text">Text Editor</span>
        {activeDoc && (
          <span className="text-xs text-dark-muted truncate max-w-[200px]">
            {activeDoc.name}
            {activeDirty ? " •" : ""}
          </span>
        )}
        <div className="h-4 w-px bg-dark-accent/60" />
        <Button variant="secondary" size="sm" onClick={handleNewFile}>
          New file
        </Button>
        <Button variant="secondary" size="sm" onClick={handleInsertPerson} disabled={!activeFileId}>
          Insert person
        </Button>
        <Button variant="secondary" size="sm" onClick={handleInsertUnion} disabled={!activeFileId}>
          Insert union
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDeleteFile} disabled={!activeFileId}>
          Delete file
        </Button>
        <Button variant="secondary" size="sm" onClick={handleOpenInNewPane}>
          Open in new pane
        </Button>
        <div className="h-4 w-px bg-dark-accent/60" />
        <button
          type="button"
          onClick={() => onUniformPaneWidthChange(!uniformPaneWidth)}
          disabled={unifiedScroll}
          className={`px-2 py-1 text-xs rounded border disabled:opacity-50 ${
            uniformPaneWidth
              ? "bg-dark-accent border-dark-accent text-dark-text"
              : "border-dark-accent/50 text-dark-muted hover:text-dark-text"
          }`}
        >
          Uniform width
        </button>
        <button
          type="button"
          onClick={handleExpandAllPanes}
          disabled={panes.length === 0 || unifiedScroll}
          className="px-2 py-1 text-xs rounded border border-dark-accent/50 text-dark-muted hover:text-dark-text disabled:opacity-50"
        >
          Expand all panes
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-dark-muted whitespace-nowrap">
            Text size: {textScalePercent}%
          </span>
          <input
            type="range"
            min={BEAT_TEXT_SCALE_PERCENT_MIN}
            max={BEAT_TEXT_SCALE_PERCENT_MAX}
            step={5}
            value={textScalePercent}
            onChange={(e) => onTextScalePercentChange(Number(e.target.value))}
            className="w-20 h-1 accent-blue-500 cursor-pointer"
          />
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onUnifiedScrollChange(!unifiedScroll)}
          className={`px-2 py-1 text-xs rounded border ${
            unifiedScroll
              ? "bg-dark-accent border-dark-accent text-dark-text"
              : "border-dark-accent/50 text-dark-muted hover:text-dark-text"
          }`}
        >
          {unifiedScroll ? "Unified" : "Side-by-side"}
        </button>
      </div>

      {parseErrors.length > 0 && (
        <div className="px-3 py-2 border-b border-red-500/40 bg-red-500/10 text-xs text-red-300 space-y-0.5">
          {parseErrors.map((err) => (
            <p key={err}>{err}</p>
          ))}
        </div>
      )}

      {panes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-dark-muted text-sm px-4 text-center">
          Open a file from Sub Entities, or create a new file.
        </div>
      ) : unifiedScroll ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {panes.map((pane) => renderUnifiedSection(pane))}
        </div>
      ) : (
        <div
          ref={paneRowRef}
          className={`flex-1 min-h-0 flex ${uniformPaneWidth ? "overflow-x-auto overflow-y-hidden" : ""}`}
        >
          {uniformPaneWidth && (
            <div
              className="flex min-h-0 flex-shrink-0"
              style={{ minWidth: uniformPaneWidthPx * panes.length }}
            >
              {panes.map((pane, i) => renderSideBySidePane(pane, i))}
            </div>
          )}
          {!uniformPaneWidth && panes.map((pane, i) => renderSideBySidePane(pane, i))}
        </div>
      )}
    </div>
  );
}
