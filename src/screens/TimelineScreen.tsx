import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import TopBar from "../components/ui/TopBar";
import ModuleBadge from "../components/ui/ModuleBadge";
import DisplayModeDropdown from "../components/ui/DisplayModeDropdown";
import ModuleSwitcherNavbar from "../components/ui/ModuleSwitcherNavbar";
import { useWindowTitle } from "../hooks/useWindowTitle";
import TimelineEntitiesPanel from "../components/timeline/TimelineEntitiesPanel";
import TimelineBoard from "../components/timeline/TimelineBoard";
import TimelineToolbar from "../components/timeline/TimelineToolbar";
import TimelineScriptPane from "../components/timeline/TimelineScriptPane";
import TimelineInspector, { type InspectorMode } from "../components/timeline/TimelineInspector";
import TimelineTextEditorWorkspace, {
  type TextEditorDrafts,
  type TextEditorPane,
} from "../components/timeline/TimelineTextEditorWorkspace";
import TimelineSaveControls from "../components/timeline/TimelineSaveControls";
import { getSelectedBeatIds, previewDocumentDeleteCounts, useTimelineStore } from "../store/timelineStore";
import { useAppStore } from "../store/appStore";
import { isTauri, openOrFocusIntroWindow } from "../tauri/openProjectInNewWindow";
import { getStorageDriver } from "../storage/StorageDriver";
import { DEFAULT_BEAT_TEXT_SCALE_PERCENT } from "../store/timelineTypes";

const ENTITIES_MIN_W = 220;
const ENTITIES_MAX_W = 520;
const SCRIPT_MIN_H = 160;
const SCRIPT_MAX_H = 520;
const INSPECTOR_MIN_W = 256;
const INSPECTOR_MAX_W = 900;
const INSPECTOR_DEFAULT_EXPANDED_W = 640;
const UNIFORM_PANE_WIDTH_DEFAULT_PX = 420;

type FileDeleteConfirm = {
  docId: string;
  paneId: string;
  fileName: string;
  laneCount: number;
  beatCount: number;
  crossingCount: number;
};

export default function TimelineScreen() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [textDrafts, setTextDrafts] = useState<TextEditorDrafts>({});
  const [panes, setPanes] = useState<TextEditorPane[]>([]);
  const [activePaneId, setActivePaneId] = useState<string | null>(null);
  const [unifiedScroll, setUnifiedScroll] = useState(false);
  const [paneFractions, setPaneFractions] = useState<number[]>([]);
  const [uniformPaneWidth, setUniformPaneWidth] = useState(false);
  const [uniformPaneWidthPx, setUniformPaneWidthPx] = useState(UNIFORM_PANE_WIDTH_DEFAULT_PX);
  const [textScalePercent, setTextScalePercent] = useState(DEFAULT_BEAT_TEXT_SCALE_PERCENT);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("isolation");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [scriptPaneOpen, setScriptPaneOpen] = useState(true);
  const [entitiesWidth, setEntitiesWidth] = useState(260);
  const [scriptHeight, setScriptHeight] = useState(240);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_MIN_W);
  const [inspectorExpandedWidth, setInspectorExpandedWidth] = useState(INSPECTOR_DEFAULT_EXPANDED_W);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [textEditorCommitError, setTextEditorCommitError] = useState<string | null>(null);
  const [fileDeleteConfirm, setFileDeleteConfirm] = useState<FileDeleteConfirm | null>(null);

  const loadTimeline = useTimelineStore((s) => s.loadTimeline);
  const displayMode = useTimelineStore((s) => s.displayMode);
  const setDisplayMode = useTimelineStore((s) => s.setDisplayMode);
  const applyDocumentEdits = useTimelineStore((s) => s.applyDocumentEdits);
  const deleteDocumentCascade = useTimelineStore((s) => s.deleteDocumentCascade);
  const createUserDocument = useTimelineStore((s) => s.createUserDocument);
  const selection = useTimelineStore((s) => s.selection);
  const removeBeats = useTimelineStore((s) => s.removeBeats);
  const setIntroDialogOpen = useAppStore((s) => s.setIntroDialogOpen);

  const isTextEditor = displayMode === "text";

  const openFileIds = useMemo(
    () => panes.map((p) => p.docId).filter((id): id is string => id != null),
    [panes]
  );

  const activeFileId = useMemo(() => {
    if (!activePaneId) return null;
    return panes.find((p) => p.paneId === activePaneId)?.docId ?? null;
  }, [panes, activePaneId]);

  const dirtyDocIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, draft] of Object.entries(textDrafts)) {
      if (draft.dirty) ids.add(id);
    }
    return ids;
  }, [textDrafts]);

  const hasDraftChanges = dirtyDocIds.size > 0;

  const commitAllDirtyDrafts = useCallback((): { ok: boolean } => {
    const dirtyEdits = Object.entries(textDrafts)
      .filter(([, d]) => d.dirty)
      .map(([docId, draft]) => ({ docId, content: draft.content }));

    if (dirtyEdits.length === 0) {
      setTextEditorCommitError(null);
      return { ok: true };
    }

    const result = applyDocumentEdits(dirtyEdits);
    if (!result.ok) {
      setTextEditorCommitError(result.errors.join("; "));
      return { ok: false };
    }

    const nextDrafts = { ...textDrafts };
    for (const { docId } of dirtyEdits) {
      delete nextDrafts[docId];
    }

    setTextDrafts(nextDrafts);
    setTextEditorCommitError(null);
    return { ok: true };
  }, [textDrafts, applyDocumentEdits]);

  const handleCommitDraftsForSave = useCallback((): { ok: boolean } => {
    return commitAllDirtyDrafts();
  }, [commitAllDirtyDrafts]);

  const removePaneAndDraftForDoc = useCallback((docId: string, paneId?: string) => {
    if (paneId) {
      setPanes((prev) => prev.filter((p) => p.paneId !== paneId));
      setActivePaneId((cur) => (cur === paneId ? null : cur));
    } else {
      setPanes((prev) => prev.filter((p) => p.docId !== docId));
      setActivePaneId((cur) => {
        const pane = panes.find((p) => p.paneId === cur);
        return pane?.docId === docId ? null : cur;
      });
    }
    setTextDrafts((d) => {
      const { [docId]: _, ...rest } = d;
      return rest;
    });
  }, [panes]);

  const handleFileDeleteConfirm = useCallback(() => {
    if (!fileDeleteConfirm) return;
    const { docId, paneId } = fileDeleteConfirm;
    const draftContent = textDrafts[docId]?.content;
    const stored = useTimelineStore.getState().documents.find((d) => d.id === docId);
    const content = draftContent ?? stored?.content ?? "";
    deleteDocumentCascade(docId, content);
    if (paneId) removePaneAndDraftForDoc(docId, paneId);
    else removePaneAndDraftForDoc(docId);
    setFileDeleteConfirm(null);
  }, [fileDeleteConfirm, textDrafts, deleteDocumentCascade, removePaneAndDraftForDoc]);

  useEffect(() => {
    if (selection.length === 0) setInspectorOpen(false);
  }, [selection]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      if (isTextEditor) return;
      const beatIds = getSelectedBeatIds(selection);
      if (beatIds.length === 0) return;
      e.preventDefault();
      removeBeats(beatIds);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, removeBeats, isTextEditor]);

  useWindowTitle(projectName ? `${projectName} - Synapse IWE` : "Synapse IWE");

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadTimeline(projectId).then(() => {
      setLoading(false);
    });
    getStorageDriver()
      .listProjects()
      .then((list) => {
        const p = list.find((x) => x.id === projectId);
        setProjectName(p?.name ?? "Timeline Outliner");
      });
  }, [projectId, loadTimeline]);

  const handleSaveName = async () => {
    const trimmed = editNameValue.trim();
    setIsEditingName(false);
    if (!trimmed || !projectId || trimmed === projectName) return;
    const driver = getStorageDriver();
    await driver.updateProjectMeta(projectId, { name: trimmed, updatedAt: Date.now() });
    setProjectName(trimmed);
  };

  const handleStartEditName = () => {
    setEditNameValue(projectName);
    setIsEditingName(true);
  };

  const handleOpenFile = useCallback(
    (docId: string) => {
      const existingPane = panes.find((p) => p.docId === docId);

      if (existingPane && existingPane.paneId === activePaneId) {
        setActivePaneId(null);
        return;
      }

      if (existingPane) {
        setActivePaneId(existingPane.paneId);
        return;
      }

      if (activePaneId) {
        setPanes((prev) =>
          prev.map((p) => (p.paneId === activePaneId ? { ...p, docId } : p))
        );
        return;
      }

      const paneId = crypto.randomUUID();
      setPanes((prev) => [...prev, { paneId, docId }]);
      setActivePaneId(paneId);
    },
    [panes, activePaneId]
  );

  const handleNewUserFile = useCallback(() => {
    const id = createUserDocument("Untitled");
    const paneId = crypto.randomUUID();
    setPanes((prev) => [...prev, { paneId, docId: id }]);
    setActivePaneId(paneId);
  }, [createUserDocument]);

  const handleDeleteUserFile = useCallback(
    (docId: string) => {
      const doc = useTimelineStore.getState().documents.find((d) => d.id === docId);
      if (!doc) return;
      const pane = panes.find((p) => p.docId === docId);
      const content = textDrafts[docId]?.content ?? doc.content;
      const counts = previewDocumentDeleteCounts(content);
      setFileDeleteConfirm({
        docId,
        paneId: pane?.paneId ?? "",
        fileName: doc.name,
        laneCount: counts.laneCount,
        beatCount: counts.beatCount,
        crossingCount: counts.crossingCount,
      });
    },
    [panes, textDrafts]
  );

  const entitiesDragStart = useRef<number | null>(null);
  const entitiesStartWidth = useRef(260);
  const scriptDragStart = useRef<number | null>(null);
  const scriptStartHeight = useRef(240);
  const inspectorDragStart = useRef<number | null>(null);
  const inspectorStartWidth = useRef(INSPECTOR_MIN_W);
  const inspectorLatestWidth = useRef(INSPECTOR_MIN_W);

  const handleEntitiesPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      entitiesDragStart.current = e.clientX;
      entitiesStartWidth.current = entitiesWidth;
      document.body.style.userSelect = "none";
    },
    [entitiesWidth]
  );

  const handleScriptPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      scriptDragStart.current = e.clientY;
      scriptStartHeight.current = scriptHeight;
      document.body.style.userSelect = "none";
    },
    [scriptHeight]
  );

  const clampInspectorWidth = useCallback((width: number) => {
    const maxW = Math.min(INSPECTOR_MAX_W, window.innerWidth * 0.8);
    return Math.min(maxW, Math.max(INSPECTOR_MIN_W, width));
  }, []);

  const handleInspectorPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      inspectorDragStart.current = e.clientX;
      inspectorStartWidth.current = inspectorWidth;
      document.body.style.userSelect = "none";
    },
    [inspectorWidth]
  );

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (entitiesDragStart.current !== null) {
        const deltaX = e.clientX - entitiesDragStart.current;
        const maxW = Math.min(ENTITIES_MAX_W, window.innerWidth * 0.45);
        setEntitiesWidth(
          Math.min(maxW, Math.max(ENTITIES_MIN_W, entitiesStartWidth.current + deltaX))
        );
      }
      if (scriptDragStart.current !== null) {
        const deltaY = scriptDragStart.current - e.clientY;
        const maxH = Math.min(SCRIPT_MAX_H, window.innerHeight * 0.5);
        setScriptHeight(
          Math.min(maxH, Math.max(SCRIPT_MIN_H, scriptStartHeight.current + deltaY))
        );
      }
      if (inspectorDragStart.current !== null) {
        const deltaX = inspectorDragStart.current - e.clientX;
        const next = clampInspectorWidth(inspectorStartWidth.current + deltaX);
        inspectorLatestWidth.current = next;
        setInspectorWidth(next);
      }
    };
    const handlePointerUp = () => {
      if (inspectorDragStart.current !== null && inspectorLatestWidth.current > INSPECTOR_MIN_W + 8) {
        setInspectorExpandedWidth(inspectorLatestWidth.current);
      }
      entitiesDragStart.current = null;
      scriptDragStart.current = null;
      inspectorDragStart.current = null;
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [clampInspectorWidth]);

  const handleInspectorToggleExpand = useCallback(() => {
    setInspectorWidth((w) => {
      if (w <= INSPECTOR_MIN_W + 8) {
        return clampInspectorWidth(inspectorExpandedWidth);
      }
      return INSPECTOR_MIN_W;
    });
  }, [clampInspectorWidth, inspectorExpandedWidth]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <p className="text-dark-muted">Loading...</p>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-dark-muted mb-4">Project not found</p>
          <Button onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-dark-bg flex flex-col">
      <TopBar
        left={
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (isTauri()) {
                  openOrFocusIntroWindow();
                } else {
                  setIntroDialogOpen(true);
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-dark-muted hover:text-dark-text transition-colors"
              title="Open projects"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              Projects
            </button>
            <div className="h-4 w-px bg-dark-accent" />
            {isEditingName ? (
              <input
                type="text"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onBlur={() => void handleSaveName()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveName();
                  if (e.key === "Escape") {
                    setIsEditingName(false);
                    setEditNameValue(projectName);
                  }
                }}
                autoFocus
                className="px-2 py-0.5 rounded bg-dark-surface border border-dark-accent text-dark-text font-medium min-w-[120px] max-w-[200px] outline-none focus:border-blue-500"
              />
            ) : (
              <button
                onClick={handleStartEditName}
                className="text-dark-text font-medium truncate max-w-[200px] text-left hover:text-blue-400 transition-colors"
                title="Click to rename"
              >
                {projectName}
              </button>
            )}
            <ModuleBadge label="Timeline Outliner" />
          </div>
        }
        children={
          projectId ? (
            <div className="flex items-center justify-center gap-3">
              <DisplayModeDropdown
                activeMode={displayMode}
                supportedModes={["block", "text"]}
                onSelect={(mode) => setDisplayMode(mode === "text" ? "text" : "block")}
              />
              <ModuleSwitcherNavbar currentProjectId={projectId} />
            </div>
          ) : undefined
        }
        right={
          <div className="flex items-center gap-2">
            <TimelineSaveControls
              hasDraftChanges={hasDraftChanges}
              onCommitDrafts={handleCommitDraftsForSave}
              commitError={textEditorCommitError}
            />
            <div className="h-4 w-px bg-dark-accent" />
            <button
              onClick={() => setLeftSidebarOpen((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                leftSidebarOpen
                  ? "bg-dark-accent border-dark-accent text-dark-text"
                  : "border-dark-accent text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
              }`}
              title={leftSidebarOpen ? "Hide Sub Entities" : "Show Sub Entities"}
            >
              Sub Entities
            </button>
            {!isTextEditor && (
              <>
                <button
                  onClick={() => setScriptPaneOpen((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    scriptPaneOpen
                      ? "bg-dark-accent border-dark-accent text-dark-text"
                      : "border-dark-accent text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
                  }`}
                >
                  Script
                </button>
                <button
                  onClick={() => setInspectorOpen(!inspectorOpen)}
                  className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center ${
                    inspectorOpen
                      ? "bg-dark-accent border-dark-accent text-dark-text"
                      : "border-dark-accent text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="flex-1 flex min-h-0 flex-col">
        {!isTextEditor && (
          <TimelineToolbar onSelectForEdit={() => setInspectorOpen(true)} />
        )}
        <div className="flex-1 flex min-h-0 relative">
          {leftSidebarOpen && (
            <>
              <div className="flex-shrink-0 overflow-hidden flex" style={{ width: entitiesWidth }}>
                <TimelineEntitiesPanel
                  onSelectForEdit={() => setInspectorOpen(true)}
                  textEditorMode={isTextEditor}
                  openFileIds={openFileIds}
                  activeFileId={activeFileId}
                  dirtyDocIds={dirtyDocIds}
                  onOpenFile={handleOpenFile}
                  onNewUserFile={handleNewUserFile}
                  onDeleteUserFile={handleDeleteUserFile}
                />
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                onPointerDown={handleEntitiesPointerDown}
                className="w-2 flex-shrink-0 cursor-col-resize flex items-center justify-center group border-r border-dark-accent/50 hover:border-dark-accent/80 transition-colors select-none"
              >
                <div className="w-0.5 h-8 rounded-full bg-dark-muted/40 group-hover:bg-dark-muted/70" />
              </div>
            </>
          )}
          {!leftSidebarOpen && (
            <button
              onClick={() => setLeftSidebarOpen(true)}
              className="w-7 flex-shrink-0 bg-dark-accent/50 hover:bg-dark-accent border-r border-dark-accent flex items-center justify-center text-dark-muted hover:text-dark-text transition-colors"
              title="Show Sub Entities"
            >
              <span className="text-xs font-medium transform -rotate-90 whitespace-nowrap origin-center">
                Sub Entities
              </span>
            </button>
          )}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {isTextEditor ? (
              <TimelineTextEditorWorkspace
                drafts={textDrafts}
                onDraftsChange={setTextDrafts}
                panes={panes}
                onPanesChange={setPanes}
                activePaneId={activePaneId}
                onActivePaneIdChange={setActivePaneId}
                unifiedScroll={unifiedScroll}
                onUnifiedScrollChange={setUnifiedScroll}
                paneFractions={paneFractions}
                onPaneFractionsChange={setPaneFractions}
                uniformPaneWidth={uniformPaneWidth}
                onUniformPaneWidthChange={setUniformPaneWidth}
                uniformPaneWidthPx={uniformPaneWidthPx}
                onUniformPaneWidthPxChange={setUniformPaneWidthPx}
                textScalePercent={textScalePercent}
                onTextScalePercentChange={setTextScalePercent}
                onRequestFileDeleteConfirm={setFileDeleteConfirm}
              />
            ) : (
              <>
                <TimelineBoard
                  onSelectForEdit={() => setInspectorOpen(true)}
                  inspectorOpen={inspectorOpen}
                  inspectorWidth={inspectorWidth}
                />
                {scriptPaneOpen && (
                  <>
                    <div
                      role="separator"
                      aria-orientation="horizontal"
                      onPointerDown={handleScriptPointerDown}
                      className="h-2 flex-shrink-0 cursor-row-resize flex items-center justify-center border-t border-dark-accent/50 hover:border-dark-accent/80 transition-colors select-none"
                    >
                      <div className="h-0.5 w-8 rounded-full bg-dark-muted/40" />
                    </div>
                    <div className="flex-shrink-0 overflow-hidden" style={{ height: scriptHeight }}>
                      <TimelineScriptPane />
                    </div>
                  </>
                )}
                {!scriptPaneOpen && (
                  <button
                    onClick={() => setScriptPaneOpen(true)}
                    className="h-6 flex-shrink-0 bg-dark-accent/50 hover:bg-dark-accent border-t border-dark-accent flex items-center justify-center text-dark-muted hover:text-dark-text text-xs transition-colors"
                  >
                    Script
                  </button>
                )}
              </>
            )}
          </div>
          {inspectorOpen && !isTextEditor && (
            <TimelineInspector
              width={inspectorWidth}
              collapsedWidth={INSPECTOR_MIN_W}
              onResizePointerDown={handleInspectorPointerDown}
              onToggleExpand={handleInspectorToggleExpand}
              mode={inspectorMode}
              onModeChange={setInspectorMode}
            />
          )}
        </div>
      </div>

      <Modal
        isOpen={fileDeleteConfirm != null}
        onClose={() => setFileDeleteConfirm(null)}
        title="Delete file?"
        contentClassName="max-w-md"
      >
        {fileDeleteConfirm && (
          <>
            <p className="text-sm text-dark-muted mb-4">
              Deleting{" "}
              <span className="text-dark-text font-medium">{fileDeleteConfirm.fileName}</span> will
              remove{" "}
              {fileDeleteConfirm.laneCount === 0 &&
              fileDeleteConfirm.beatCount === 0 &&
              fileDeleteConfirm.crossingCount === 0 ? (
                <>no lanes or beats from the project model (file is empty or has no declarations).</>
              ) : (
                <>
                  {fileDeleteConfirm.laneCount > 0 && (
                    <>
                      {fileDeleteConfirm.laneCount} lane
                      {fileDeleteConfirm.laneCount === 1 ? "" : "s"}
                    </>
                  )}
                  {fileDeleteConfirm.laneCount > 0 && fileDeleteConfirm.beatCount > 0 && ", "}
                  {fileDeleteConfirm.beatCount > 0 && (
                    <>
                      {fileDeleteConfirm.beatCount} beat
                      {fileDeleteConfirm.beatCount === 1 ? "" : "s"}
                    </>
                  )}
                  {(fileDeleteConfirm.laneCount > 0 || fileDeleteConfirm.beatCount > 0) &&
                    fileDeleteConfirm.crossingCount > 0 &&
                    ", "}
                  {fileDeleteConfirm.crossingCount > 0 && (
                    <>
                      {fileDeleteConfirm.crossingCount} crossing
                      {fileDeleteConfirm.crossingCount === 1 ? "" : "s"}
                    </>
                  )}{" "}
                  from the project. This cannot be undone.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setFileDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleFileDeleteConfirm}>
                Delete file
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
