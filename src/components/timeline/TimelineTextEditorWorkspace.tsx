import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../ui/Button";
import BeatDocumentEditorView, {
  type BeatDocumentEditorHandle,
} from "./beatEditor/BeatDocumentEditorView";
import BeatEditorFieldToolbar, { type BeatEditorTool } from "./beatEditor/BeatEditorFieldToolbar";
import {
  applyAutoLabelsToDocument,
  assignFieldInSegment,
  findSegmentForOffset,
  insertAutoSeparatorsInText,
  insertSeparatorAtCursor,
  type FieldDisableFlags,
} from "./beatEditor/beatDocumentModel";
import { useTimelineStore, previewDocumentDeleteCounts } from "../../store/timelineStore";
import { insertBeatAtCursor, insertLaneAtCursor } from "../../store/timelineTextBlocks";
import {
  BEAT_TEXT_SCALE_PERCENT_MAX,
  BEAT_TEXT_SCALE_PERCENT_MIN,
  getDefaultLaneLabel,
} from "../../store/timelineTypes";

export interface TextEditorDrafts {
  [docId: string]: { content: string; dirty: boolean };
}

export interface TextEditorPane {
  paneId: string;
  docId: string | null;
}

const UNIFORM_PANE_WIDTH_MIN = 240;
const UNIFORM_PANE_WIDTH_MAX = 1200;

interface TimelineTextEditorWorkspaceProps {
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
    laneCount: number;
    beatCount: number;
    crossingCount: number;
  }) => void;
}

export default function TimelineTextEditorWorkspace({
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
}: TimelineTextEditorWorkspaceProps) {
  const documents = useTimelineStore((s) => s.documents);
  const setDirtyDocumentIds = useTimelineStore((s) => s.setDirtyDocumentIds);
  const importLabelPrefixes = useTimelineStore((s) => s.importLabelPrefixes);
  const addImportLabelPrefix = useTimelineStore((s) => s.addImportLabelPrefix);
  const removeImportLabelPrefix = useTimelineStore((s) => s.removeImportLabelPrefix);
  const createUserDocument = useTimelineStore((s) => s.createUserDocument);
  const applyDocumentEdits = useTimelineStore((s) => s.applyDocumentEdits);
  const renameDocument = useTimelineStore((s) => s.renameDocument);
  const lanes = useTimelineStore((s) => s.lanes);
  const ensureActiveFolder = useTimelineStore((s) => s.ensureActiveFolder);

  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [activeTool, setActiveTool] = useState<BeatEditorTool>(null);
  const [disabledFields, setDisabledFields] = useState<FieldDisableFlags>({
    synopsis: false,
    detail: false,
    date: false,
  });
  const [prefixPanelOpen, setPrefixPanelOpen] = useState(false);
  const [newPrefix, setNewPrefix] = useState("");
  const [activePrefixes, setActivePrefixes] = useState<Set<string>>(
    () => new Set(importLabelPrefixes)
  );
  const editorRefs = useRef<Map<string, BeatDocumentEditorHandle | null>>(new Map());
  const paneRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActivePrefixes((prev) => {
      const next = new Set(prev);
      for (const p of importLabelPrefixes) {
        next.add(p);
      }
      return next;
    });
  }, [importLabelPrefixes]);

  const activePane = activePaneId
    ? panes.find((p) => p.paneId === activePaneId) ?? null
    : null;
  const activeFileId = activePane?.docId ?? null;
  const activeDoc = activeFileId
    ? documents.find((d) => d.id === activeFileId) ?? null
    : null;
  const activeDraft = activeFileId ? drafts[activeFileId] : null;
  const activeDirty = activeDraft?.dirty ?? false;

  const getDocContent = useCallback(
    (docId: string): string => {
      const draft = drafts[docId];
      if (draft?.dirty) return draft.content;
      return documents.find((d) => d.id === docId)?.content ?? "";
    },
    [drafts, documents]
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
      const result = applyDocumentEdits([{ docId, content }]);
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
    [drafts, onDraftsChange, applyDocumentEdits]
  );

  const activePrefixList = importLabelPrefixes.filter((p) => activePrefixes.has(p));

  const handleApplySelection = useCallback(() => {
    if (!activeFileId || !activeTool) return;
    const handle = editorRefs.current.get(activeFileId);
    const sel = handle?.getSelection();
    if (!sel || !sel.text.trim()) return;

    const content = getDocContent(activeFileId);
    const segment = findSegmentForOffset(content, sel.from);
    if (!segment) return;

    const updatedSegment = assignFieldInSegment(segment.rawText, activeTool, sel.text);
    const before = content.slice(0, segment.start);
    const after = content.slice(segment.end);
    setContent(activeFileId, `${before}${updatedSegment}${after}`);
  }, [activeFileId, activeTool, getDocContent, setContent]);

  useEffect(() => {
    const onMouseUp = () => {
      if (!activeTool) return;
      handleApplySelection();
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [activeTool, handleApplySelection]);

  const handleAutoDetectFields = () => {
    if (!activeFileId || !activeDoc) return;
    const content = getDocContent(activeFileId);
    const next = applyAutoLabelsToDocument(content, disabledFields, activePrefixList);
    setContent(activeFileId, next);
  };

  const handleInsertSeparator = () => {
    if (!activeFileId) return;
    const handle = editorRefs.current.get(activeFileId);
    const content = getDocContent(activeFileId);
    const pos = handle?.getCursorPos() ?? content.length;
    setContent(activeFileId, insertSeparatorAtCursor(content, pos));
  };

  const removePaneById = (paneId: string) => {
    const next = panes.filter((p) => p.paneId !== paneId);
    onPanesChange(next);
    if (activePaneId === paneId) {
      onActivePaneIdChange(next[0]?.paneId ?? null);
    }
  };

  const handleClosePane = (paneId: string) => {
    removePaneById(paneId);
  };

  const handleOpenInNewPane = () => {
    const paneId = crypto.randomUUID();
    onPanesChange([...panes, { paneId, docId: null }]);
    onActivePaneIdChange(paneId);
  };

  const handleNewFile = () => {
    const id = createUserDocument("Untitled");
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

  const handleInsertTemplate = () => {
    if (!activeFileId) return;
    const content = getDocContent(activeFileId);
    const handle = editorRefs.current.get(activeFileId);
    const cursorPos = handle?.getCursorPos() ?? content.length;
    const result = insertBeatAtCursor(content, cursorPos);
    if (!result.ok) {
      setParseErrors([result.error]);
      return;
    }
    commitInsertToModel(activeFileId, result.content, result.cursorPos);
  };

  const handleInsertLane = () => {
    if (!activeFileId) return;
    ensureActiveFolder();
    const content = getDocContent(activeFileId);
    const sortOrder = lanes.length;
    const label = getDefaultLaneLabel(sortOrder);
    const result = insertLaneAtCursor(content, sortOrder, label);
    if (!result.ok) {
      setParseErrors([result.error]);
      return;
    }
    commitInsertToModel(activeFileId, result.content, result.cursorPos);
  };

  const handleDeleteFile = () => {
    if (!activeFileId || !activeDoc || !activePane) return;

    const content = getDocContent(activeFileId);
    const counts = previewDocumentDeleteCounts(content);
    onRequestFileDeleteConfirm({
      docId: activeFileId,
      paneId: activePane.paneId,
      fileName: activeDoc.name,
      laneCount: counts.laneCount,
      beatCount: counts.beatCount,
      crossingCount: counts.crossingCount,
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
        const delta = ev.clientX - startX;
        onUniformPaneWidthPxChange(clampUniformWidth(startWidth + delta));
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
    const container = (e.currentTarget.parentElement?.parentElement as HTMLElement | null);
    if (!container) return;
    const width = container.getBoundingClientRect().width;

    const onMove = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) / width;
      const next = [...startFractions];
      const left = Math.max(0.15, Math.min(0.85, startFractions[index] + delta));
      const rightOrig = startFractions[index] + startFractions[index + 1];
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

  const handlePaneRowWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!uniformPaneWidth || unifiedScroll) return;
    const el = paneRowRef.current;
    if (!el) return;
    const absX = Math.abs(e.deltaX);
    const absY = Math.abs(e.deltaY);
    const horizontalIntent = absX > absY || e.shiftKey;
    if (!horizontalIntent) return;
    e.preventDefault();
    el.scrollLeft += e.deltaX + (e.shiftKey ? e.deltaY : 0);
  }, [uniformPaneWidth, unifiedScroll]);

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
      onPaste={insertAutoSeparatorsInText}
      fontSizePercent={textScalePercent}
    />
  );

  const renderPaneCloseButton = (paneId: string) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleClosePane(paneId);
      }}
      className="flex-shrink-0 px-1.5 py-0.5 text-dark-muted hover:text-dark-text rounded hover:bg-dark-accent/40"
      title="Close pane (file stays saved; unsaved draft kept in memory)"
      aria-label="Close pane"
    >
      ×
    </button>
  );

  const renderEmptyPaneBody = () => (
    <div className="flex-1 min-h-0 flex items-center justify-center text-dark-muted text-sm px-4 text-center">
      Empty pane — click a file in Entities to load it here
    </div>
  );

  const getDocForPane = (pane: TextEditorPane) =>
    pane.docId ? documents.find((d) => d.id === pane.docId) ?? null : null;

  const commitRename = (docId: string) => {
    renameDocument(docId, renameValue);
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
          <div className="flex-1 min-h-0 flex flex-col p-2">
            {pane.docId && doc
              ? renderEditor(pane.docId, content)
              : renderEmptyPaneBody()}
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
        <div className="min-h-[280px] h-[40vh] px-3 pb-3 pt-2 overflow-hidden flex flex-col">
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
        <Button
          variant="secondary"
          size="sm"
          onClick={handleInsertTemplate}
          disabled={!activeFileId}
          title="Insert an empty Beat block at the cursor (inside a Lane beats array)"
        >
          Insert beat
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleInsertLane}
          disabled={!activeFileId}
          title="Append a new empty Lane block to the active file"
        >
          Insert lane
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDeleteFile}
          disabled={!activeFileId}
          title="Delete the file in the active pane"
        >
          Delete file
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleOpenInNewPane}
          title="Open a new empty pane (click a file in Entities to load it)"
        >
          Open in new pane
        </Button>
        <div className="h-4 w-px bg-dark-accent/60" />
        <button
          type="button"
          onClick={() => onUniformPaneWidthChange(!uniformPaneWidth)}
          disabled={unifiedScroll}
          className={`px-2 py-1 text-xs rounded border disabled:opacity-50 disabled:cursor-not-allowed ${
            uniformPaneWidth
              ? "bg-dark-accent border-dark-accent text-dark-text"
              : "border-dark-accent/50 text-dark-muted hover:text-dark-text"
          }`}
          title={
            unifiedScroll
              ? "Uniform width applies to side-by-side panes only"
              : "Resize all panes to the same width"
          }
        >
          Uniform width
        </button>
        <button
          type="button"
          onClick={handleExpandAllPanes}
          disabled={panes.length === 0 || unifiedScroll}
          className="px-2 py-1 text-xs rounded border border-dark-accent/50 text-dark-muted hover:text-dark-text disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            unifiedScroll
              ? "Expand all panes applies to side-by-side panes only"
              : "Evenly expand all open panes to fill the available width"
          }
        >
          Expand all panes
        </button>
        <div
          className="flex items-center gap-2"
          title={`Text size in ${unifiedScroll ? "Unified" : "Side-by-side"} view (tracked independently per layout)`}
        >
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
          title="Toggle unified scroll vs side-by-side panes"
        >
          {unifiedScroll ? "Unified" : "Side-by-side"}
        </button>
      </div>

      <div className="px-3 pt-2">
        <BeatEditorFieldToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          disabledFields={disabledFields}
          onToggleField={(field) =>
            setDisabledFields((d) => ({ ...d, [field]: !d[field] }))
          }
          onAutoDetectFields={handleAutoDetectFields}
          onInsertSeparator={handleInsertSeparator}
          autoDetectDisabled={!activeFileId}
          prefixPanelOpen={prefixPanelOpen}
          onTogglePrefixPanel={() => setPrefixPanelOpen((v) => !v)}
          newPrefix={newPrefix}
          onNewPrefixChange={setNewPrefix}
          onAddPrefix={() => {
            if (newPrefix.trim()) {
              addImportLabelPrefix(newPrefix.trim());
              setActivePrefixes((s) => new Set([...s, newPrefix.trim()]));
              setNewPrefix("");
            }
          }}
          onRemovePrefix={removeImportLabelPrefix}
          activePrefixes={activePrefixes}
          onToggleActivePrefix={(prefix) => {
            setActivePrefixes((s) => {
              const next = new Set(s);
              if (next.has(prefix)) next.delete(prefix);
              else next.add(prefix);
              return next;
            });
          }}
        />
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
          Open a file from Entities, or create a new file.
        </div>
      ) : unifiedScroll ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {panes.map((pane) => renderUnifiedSection(pane))}
        </div>
      ) : (
        <div
          ref={paneRowRef}
          onWheel={handlePaneRowWheel}
          className={`flex-1 min-h-0 flex overflow-y-hidden ${
            uniformPaneWidth ? "overflow-x-auto" : ""
          }`}
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
