import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../ui/Button";
import BeatDocumentEditorView, {
  type BeatDocumentEditorHandle,
} from "../timeline/beatEditor/BeatDocumentEditorView";
import {
  BEAT_TEXT_SCALE_PERCENT_MAX,
  BEAT_TEXT_SCALE_PERCENT_MIN,
} from "../../store/timelineTypes";
import { useChartsStore } from "../../store/chartsStore";

export interface TextEditorDrafts {
  [docId: string]: { content: string; dirty: boolean };
}

export interface TextEditorPane {
  paneId: string;
  docId: string | null;
}

interface ChartsTextEditorWorkspaceProps {
  drafts: TextEditorDrafts;
  onDraftsChange: (drafts: TextEditorDrafts) => void;
  panes: TextEditorPane[];
  onPanesChange: (panes: TextEditorPane[]) => void;
  activePaneId: string | null;
  onActivePaneIdChange: (id: string | null) => void;
  unifiedScroll: boolean;
  onUnifiedScrollChange: (v: boolean) => void;
  textScalePercent: number;
  onTextScalePercentChange: (pct: number) => void;
  onCommitError: (errors: string[] | null) => void;
}

export default function ChartsTextEditorWorkspace({
  drafts,
  onDraftsChange,
  panes,
  onPanesChange,
  activePaneId,
  onActivePaneIdChange,
  unifiedScroll,
  onUnifiedScrollChange,
  textScalePercent,
  onTextScalePercentChange,
  onCommitError,
}: ChartsTextEditorWorkspaceProps) {
  const documents = useChartsStore((s) => s.documents);
  const folders = useChartsStore((s) => s.folders);
  const activeFolderId = useChartsStore((s) => s.activeFolderId);
  const setDirtyDocumentIds = useChartsStore((s) => s.setDirtyDocumentIds);
  const createDocument = useChartsStore((s) => s.createDocument);
  const renameDocument = useChartsStore((s) => s.renameDocument);
  const deleteDocument = useChartsStore((s) => s.deleteDocument);
  const getDocumentDisplayContent = useChartsStore((s) => s.getDocumentDisplayContent);

  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const editorRefs = useRef<Map<string, BeatDocumentEditorHandle | null>>(new Map());

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

  useEffect(() => {
    return () => setDirtyDocumentIds([]);
  }, [setDirtyDocumentIds]);

  const setContent = useCallback(
    (docId: string, content: string) => {
      onDraftsChange({
        ...drafts,
        [docId]: { content, dirty: true },
      });
      onCommitError(null);
    },
    [drafts, onDraftsChange, onCommitError]
  );

  const removePaneById = (paneId: string) => {
    const next = panes.filter((p) => p.paneId !== paneId);
    onPanesChange(next);
    if (activePaneId === paneId) {
      onActivePaneIdChange(next[0]?.paneId ?? null);
    }
  };

  const handleNewFile = () => {
    const folder = folders.find((f) => f.id === activeFolderId) ?? folders[0];
    if (!folder) return;
    const id = createDocument(folder.kind, folder.id);
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

  const handleDeleteFile = () => {
    if (!activeFileId || !activePaneId) return;
    deleteDocument(activeFileId);
    onPanesChange(
      panes.map((p) => (p.paneId === activePaneId ? { ...p, docId: null } : p))
    );
    const nextDrafts = { ...drafts };
    delete nextDrafts[activeFileId];
    onDraftsChange(nextDrafts);
  };

  const saveRename = (docId: string) => {
    renameDocument(docId, renameValue);
    setRenamingDocId(null);
  };

  const renderPaneBody = (docId: string | null) => {
    if (!docId) {
      return (
        <div className="flex-1 min-h-0 flex items-center justify-center text-dark-muted text-sm px-4 text-center">
          Empty pane — click a file in Sub Entities to load it here
        </div>
      );
    }
    const doc = documents.find((d) => d.id === docId);
    if (!doc) {
      return (
        <div className="flex-1 min-h-0 flex items-center justify-center text-dark-muted text-sm px-4 text-center">
          File not found
        </div>
      );
    }
    const content = getDocContent(docId);
    const dirty = drafts[docId]?.dirty ?? false;
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-3 py-1.5 text-xs font-medium text-dark-muted uppercase tracking-wide border-b border-dark-accent/30 flex items-center gap-2 shrink-0">
          {renamingDocId === docId ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => saveRename(docId)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename(docId);
                if (e.key === "Escape") setRenamingDocId(null);
              }}
              className="flex-1 px-2 py-0.5 text-xs bg-dark-bg border border-blue-500 rounded text-dark-text"
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="flex-1 text-left truncate hover:text-dark-text"
              onDoubleClick={() => {
                setRenamingDocId(docId);
                setRenameValue(doc.name);
              }}
            >
              {doc.name}
              {dirty ? " · Unsaved" : ""}
            </button>
          )}
        </div>
        <div className="flex-1 min-h-[240px] px-3 pb-3 pt-2 flex flex-col">
          <BeatDocumentEditorView
            ref={(handle) => {
              editorRefs.current.set(docId, handle);
            }}
            content={content}
            onChange={(text) => setContent(docId, text)}
            separatorsCommitted={false}
            fontSizePercent={textScalePercent}
          />
        </div>
      </div>
    );
  };

  const renderPane = (pane: TextEditorPane) => {
    const isActive = pane.paneId === activePaneId;
    return (
      <div
        key={pane.paneId}
        className={`flex flex-col min-h-0 border border-dark-accent/40 rounded-lg overflow-hidden ${
          isActive ? "ring-1 ring-blue-500/40" : ""
        }`}
        onClick={() => onActivePaneIdChange(pane.paneId)}
      >
        <div className="flex items-center justify-between px-2 py-1 bg-dark-surface border-b border-dark-accent/30 shrink-0">
          <span className="text-xs text-dark-muted truncate">
            {pane.docId
              ? documents.find((d) => d.id === pane.docId)?.name ?? "File"
              : "Empty pane"}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removePaneById(pane.paneId);
            }}
            className="text-dark-muted hover:text-dark-text px-1"
            title="Close pane"
          >
            ×
          </button>
        </div>
        {renderPaneBody(pane.docId)}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-dark-surface/30">
      <div className="px-4 py-2 border-b border-dark-accent/50 flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">Text Editor</span>
          {activeDoc && (
            <>
              <span className="text-dark-accent/50">|</span>
              <span className="text-xs text-dark-text truncate max-w-[200px]">{activeDoc.name}</span>
              {activeDirty && <span className="text-xs text-amber-400/90">· Unsaved</span>}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={handleNewFile}>
            New file
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDeleteFile}
            disabled={!activeFileId}
          >
            Delete file
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const paneId = crypto.randomUUID();
              onPanesChange([...panes, { paneId, docId: null }]);
              onActivePaneIdChange(paneId);
            }}
          >
            Open in new pane
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-dark-muted cursor-pointer">
            <input
              type="checkbox"
              checked={unifiedScroll}
              onChange={(e) => onUnifiedScrollChange(e.target.checked)}
              className="rounded border-dark-accent bg-dark-bg text-blue-500"
            />
            Unified scroll
          </label>
          <label className="flex items-center gap-1.5 text-xs text-dark-muted">
            <span>Size</span>
            <input
              type="range"
              min={BEAT_TEXT_SCALE_PERCENT_MIN}
              max={BEAT_TEXT_SCALE_PERCENT_MAX}
              value={textScalePercent}
              onChange={(e) => onTextScalePercentChange(Number(e.target.value))}
              className="w-20"
            />
          </label>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {panes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-dark-muted text-sm px-4 text-center">
            Open a file from Sub Entities to start editing
          </div>
        ) : unifiedScroll ? (
          <div className="space-y-4">
            {panes.map((pane) =>
              pane.docId ? (
                <div key={pane.paneId} className="border border-dark-accent/40 rounded-lg overflow-hidden">
                  {renderPaneBody(pane.docId)}
                </div>
              ) : null
            )}
          </div>
        ) : (
          <div className="flex gap-3 h-full min-h-[400px]">
            {panes.map((pane) => (
              <div key={pane.paneId} className="flex-1 min-w-0">
                {renderPane(pane)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Commit all dirty drafts — exported for screen-level use */
export function commitChartsDrafts(
  drafts: TextEditorDrafts,
  applyChartsDocumentEdits: (
    edits: { docId: string; content: string }[]
  ) => { ok: true } | { ok: false; errors: string[] }
): { ok: true; nextDrafts: TextEditorDrafts } | { ok: false; errors: string[] } {
  const dirtyEdits = Object.entries(drafts)
    .filter(([, d]) => d.dirty)
    .map(([docId, draft]) => ({ docId, content: draft.content }));
  if (dirtyEdits.length === 0) {
    return { ok: true, nextDrafts: drafts };
  }
  const result = applyChartsDocumentEdits(dirtyEdits);
  if (!result.ok) return result;
  const nextDrafts = { ...drafts };
  for (const { docId } of dirtyEdits) delete nextDrafts[docId];
  return { ok: true, nextDrafts };
}
