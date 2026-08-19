import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";

const ENTITIES_MIN_W = 220;
const ENTITIES_MAX_W = 520;
const SCRIPT_MIN_H = 160;
const SCRIPT_MAX_H = 520;
const UNIFORM_PANE_WIDTH_DEFAULT_PX = 420;
import Button from "../components/ui/Button";
import ErrorBoundary from "../components/ui/ErrorBoundary";
import Modal from "../components/ui/Modal";
import TopBar from "../components/ui/TopBar";
import ModuleBadge from "../components/ui/ModuleBadge";
import DisplayModeDropdown from "../components/ui/DisplayModeDropdown";
import ModuleSwitcherNavbar from "../components/ui/ModuleSwitcherNavbar";
import { useWindowTitle } from "../hooks/useWindowTitle";
import FamilyTreeCanvas from "../components/family-tree/FamilyTreeCanvas";
import FamilyTreeToolbar from "../components/family-tree/FamilyTreeToolbar";
import FamilyTreeSaveControls from "../components/family-tree/FamilyTreeSaveControls";
import FamilyTreeLeftSidebar from "../components/family-tree/FamilyTreeLeftSidebar";
import FamilyTreeScriptPane from "../components/family-tree/FamilyTreeScriptPane";
import FamilyTreeInspector from "../components/family-tree/FamilyTreeInspector";
import FamilyTreeTextEditorWorkspace, {
  type TextEditorDrafts,
  type TextEditorPane,
} from "../components/family-tree/FamilyTreeTextEditorWorkspace";
import { previewFamilyDocumentDeleteCounts } from "../store/familyTreeDocumentHelpers";
import { useFamilyTreeStore } from "../store/familyTreeStore";
import { useAppStore } from "../store/appStore";
import { isTauri, openOrFocusIntroWindow } from "../tauri/openProjectInNewWindow";
import { getStorageDriver } from "../storage/StorageDriver";
import { DEFAULT_BEAT_TEXT_SCALE_PERCENT } from "../store/timelineTypes";

type FileDeleteConfirm = {
  docId: string;
  paneId: string;
  fileName: string;
  personCount: number;
  unionCount: number;
};

export default function FamilyTreeScreen() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [scriptPaneOpen, setScriptPaneOpen] = useState(true);
  const [entitiesWidth, setEntitiesWidth] = useState(260);
  const [scriptHeight, setScriptHeight] = useState(240);
  const [isResizingEntities, setIsResizingEntities] = useState(false);
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [textDrafts, setTextDrafts] = useState<TextEditorDrafts>({});
  const [panes, setPanes] = useState<TextEditorPane[]>([]);
  const [activePaneId, setActivePaneId] = useState<string | null>(null);
  const [unifiedScroll, setUnifiedScroll] = useState(false);
  const [paneFractions, setPaneFractions] = useState<number[]>([]);
  const [uniformPaneWidth, setUniformPaneWidth] = useState(false);
  const [uniformPaneWidthPx, setUniformPaneWidthPx] = useState(UNIFORM_PANE_WIDTH_DEFAULT_PX);
  const [sideBySideTextScalePercent, setSideBySideTextScalePercent] = useState(
    DEFAULT_BEAT_TEXT_SCALE_PERCENT
  );
  const [unifiedTextScalePercent, setUnifiedTextScalePercent] = useState(
    DEFAULT_BEAT_TEXT_SCALE_PERCENT
  );
  const [textEditorCommitError, setTextEditorCommitError] = useState<string | null>(null);
  const [fileDeleteConfirm, setFileDeleteConfirm] = useState<FileDeleteConfirm | null>(null);

  const loadTree = useFamilyTreeStore((s) => s.loadTree);
  const displayMode = useFamilyTreeStore((s) => s.displayMode);
  const setDisplayMode = useFamilyTreeStore((s) => s.setDisplayMode);
  const applyFamilyDocumentEdits = useFamilyTreeStore((s) => s.applyFamilyDocumentEdits);
  const deleteFamilyDocumentCascade = useFamilyTreeStore((s) => s.deleteFamilyDocumentCascade);
  const createFamilyDocument = useFamilyTreeStore((s) => s.createFamilyDocument);
  const activeFamilyTabId = useFamilyTreeStore((s) => s.activeFamilyTabId);
  const marqueeToolActive = useFamilyTreeStore((s) => s.marqueeToolActive);
  const styleEditorOpenUnionId = useFamilyTreeStore((s) => s.styleEditorOpenUnionId);
  const primarySelectedNodeId = useFamilyTreeStore((s) => s.primarySelectedNodeId);
  const inspectorFamilyId = useFamilyTreeStore((s) => s.inspectorFamilyId);
  const setInspectorFamilyId = useFamilyTreeStore((s) => s.setInspectorFamilyId);
  const inspectorBranchId = useFamilyTreeStore((s) => s.inspectorBranchId);
  const setInspectorBranchId = useFamilyTreeStore((s) => s.setInspectorBranchId);
  const setIntroDialogOpen = useAppStore((s) => s.setIntroDialogOpen);
  const isSpacePanning = useFamilyTreeStore((s) => s.isSpacePanning);

  const isTextEditor = displayMode === "text";

  const activeTextScalePercent = unifiedScroll
    ? unifiedTextScalePercent
    : sideBySideTextScalePercent;
  const handleTextScalePercentChange = useCallback(
    (pct: number) => {
      if (unifiedScroll) setUnifiedTextScalePercent(pct);
      else setSideBySideTextScalePercent(pct);
    },
    [unifiedScroll]
  );

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

    const result = applyFamilyDocumentEdits(dirtyEdits);
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
  }, [textDrafts, applyFamilyDocumentEdits]);

  const handleCommitDraftsForSave = useCallback((): { ok: boolean } => {
    return commitAllDirtyDrafts();
  }, [commitAllDirtyDrafts]);

  const draftCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitAllDirtyDraftsRef = useRef(commitAllDirtyDrafts);
  commitAllDirtyDraftsRef.current = commitAllDirtyDrafts;

  useEffect(() => {
    if (!hasDraftChanges) return;
    if (draftCommitTimerRef.current) clearTimeout(draftCommitTimerRef.current);
    draftCommitTimerRef.current = setTimeout(() => {
      commitAllDirtyDrafts();
    }, 800);
    return () => {
      if (draftCommitTimerRef.current) clearTimeout(draftCommitTimerRef.current);
    };
  }, [textDrafts, hasDraftChanges, commitAllDirtyDrafts]);

  useEffect(() => {
    if (draftCommitTimerRef.current) clearTimeout(draftCommitTimerRef.current);
    commitAllDirtyDraftsRef.current();
  }, [displayMode]);

  useEffect(() => {
    return () => {
      if (draftCommitTimerRef.current) clearTimeout(draftCommitTimerRef.current);
      commitAllDirtyDraftsRef.current();
    };
  }, [activeFamilyTabId]);

  const removePaneAndDraftForDoc = useCallback((docId: string, paneId?: string) => {
    setPanes((prev) => {
      const next = paneId
        ? prev.filter((p) => p.paneId !== paneId)
        : prev.filter((p) => p.docId !== docId);
      setActivePaneId((cur) => {
        const wasActiveRemoved = paneId
          ? cur === paneId
          : prev.some((p) => p.paneId === cur && p.docId === docId);
        if (!wasActiveRemoved) return cur;
        return next[0]?.paneId ?? null;
      });
      return next;
    });
    setTextDrafts((d) => {
      const { [docId]: _, ...rest } = d;
      return rest;
    });
  }, []);

  const handleFileDeleteConfirm = useCallback(() => {
    if (!fileDeleteConfirm) return;
    const { docId, paneId } = fileDeleteConfirm;
    const draftContent = textDrafts[docId]?.content;
    const stored = useFamilyTreeStore.getState().documents.find((d) => d.id === docId);
    const content = draftContent ?? stored?.content ?? "";
    deleteFamilyDocumentCascade(docId, content);
    if (paneId) removePaneAndDraftForDoc(docId, paneId);
    else removePaneAndDraftForDoc(docId);
    setFileDeleteConfirm(null);
  }, [fileDeleteConfirm, textDrafts, deleteFamilyDocumentCascade, removePaneAndDraftForDoc]);

  const handleOpenFile = useCallback(
    (docId: string) => {
      const existingPane = panes.find((p) => p.docId === docId);

      if (existingPane && existingPane.paneId === activePaneId) {
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

  const handleNewUserFile = useCallback(
    (ownerFamilyId?: string | null) => {
      const id = createFamilyDocument("Untitled", ownerFamilyId);
      if (activePaneId) {
        setPanes((prev) =>
          prev.map((p) => (p.paneId === activePaneId ? { ...p, docId: id } : p))
        );
        return;
      }
      const paneId = crypto.randomUUID();
      setPanes((prev) => [...prev, { paneId, docId: id }]);
      setActivePaneId(paneId);
    },
    [createFamilyDocument, activePaneId]
  );

  const handleDeleteUserFile = useCallback(
    (docId: string) => {
      const doc = useFamilyTreeStore.getState().documents.find((d) => d.id === docId);
      if (!doc) return;
      const pane = panes.find((p) => p.docId === docId);
      const content = textDrafts[docId]?.content ?? doc.content;
      const counts = previewFamilyDocumentDeleteCounts(content);
      setFileDeleteConfirm({
        docId,
        paneId: pane?.paneId ?? "",
        fileName: doc.name,
        personCount: counts.personCount,
        unionCount: counts.unionCount,
      });
    },
    [panes, textDrafts]
  );

  // Close Inspector when neither a node, family, nor branch is selected
  useEffect(() => {
    if (!primarySelectedNodeId && !inspectorFamilyId && !inspectorBranchId) setInspectorOpen(false);
  }, [primarySelectedNodeId, inspectorFamilyId, inspectorBranchId]);

  // Node selection clears family/branch inspector targets
  useEffect(() => {
    if (primarySelectedNodeId) {
      setInspectorFamilyId(null);
      setInspectorBranchId(null);
    }
  }, [primarySelectedNodeId, setInspectorFamilyId, setInspectorBranchId]);

  useWindowTitle(projectName ? `${projectName} - Synapse IWE` : "Synapse IWE");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === " ") {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        e.preventDefault();
        useFamilyTreeStore.getState().setIsSpacePanning(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        useFamilyTreeStore.getState().setIsSpacePanning(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      useFamilyTreeStore.getState().setIsSpacePanning(false);
    };
  }, []);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadTree(projectId).then(() => {
      setLoading(false);
    });
    getStorageDriver()
      .listProjects()
      .then((list) => {
        const p = list.find((x) => x.id === projectId);
        setProjectName(p?.name ?? "Family Tree");
      });
  }, [projectId, loadTree]);

  const handleStartEditName = () => {
    setEditNameValue(projectName);
    setIsEditingName(true);
  };

  const entitiesDragStart = useRef<number | null>(null);
  const entitiesStartWidth = useRef(260);
  const scriptDragStart = useRef<number | null>(null);
  const scriptStartHeight = useRef(240);

  const handleEntitiesPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingEntities(true);
    entitiesDragStart.current = e.clientX;
    entitiesStartWidth.current = entitiesWidth;
    document.body.style.userSelect = "none";
  }, [entitiesWidth]);

  const handleScriptPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    scriptDragStart.current = e.clientY;
    scriptStartHeight.current = scriptHeight;
    document.body.style.userSelect = "none";
  }, [scriptHeight]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (entitiesDragStart.current !== null) {
        const deltaX = e.clientX - entitiesDragStart.current;
        const maxW = Math.min(ENTITIES_MAX_W, window.innerWidth * 0.45);
        const next = Math.max(ENTITIES_MIN_W, Math.min(maxW, entitiesStartWidth.current + deltaX));
        setEntitiesWidth(next);
      }
      if (scriptDragStart.current !== null) {
        const deltaY = e.clientY - scriptDragStart.current;
        const maxH = Math.min(SCRIPT_MAX_H, window.innerHeight * 0.45);
        const next = Math.max(SCRIPT_MIN_H, Math.min(maxH, scriptStartHeight.current - deltaY));
        setScriptHeight(next);
      }
    };
    const handlePointerUp = () => {
      if (entitiesDragStart.current !== null) setIsResizingEntities(false);
      entitiesDragStart.current = null;
      scriptDragStart.current = null;
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.userSelect = "";
    };
  }, []);

  const handleSaveName = async () => {
    setIsEditingName(false);
    const trimmed = editNameValue.trim();
    if (!trimmed || trimmed === projectName || !projectId) return;
    setProjectName(trimmed);
    await getStorageDriver().updateProjectMeta(projectId, {
      name: trimmed,
      updatedAt: Date.now(),
    });
  };

  if (!projectId) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-dark-muted mb-4">No project selected</p>
          <Button onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <p className="text-dark-muted">Loading...</p>
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
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
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
            <ModuleBadge label="Family Tree" />
          </div>
        }
        children={
          projectId ? (
            <div className="flex items-center justify-center gap-3">
              <DisplayModeDropdown
                activeMode={displayMode}
                supportedModes={["nodes", "text"]}
                onSelect={(mode) => setDisplayMode(mode === "text" ? "text" : "nodes")}
              />
              <ModuleSwitcherNavbar currentProjectId={projectId} currentModuleType="Family Tree" />
            </div>
          ) : undefined
        }
        right={
          <div className="flex items-center gap-2">
            <FamilyTreeSaveControls
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
                  title={scriptPaneOpen ? "Hide Script" : "Show Script"}
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
                  title={inspectorOpen ? "Hide Inspector" : "Show Inspector"}
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
        {!isTextEditor && <FamilyTreeToolbar />}
        <ErrorBoundary fallbackTitle="Family Tree error">
      <div className="flex-1 flex min-h-0">
          {leftSidebarOpen && (
            <>
              <div
                className="flex-shrink-0 overflow-hidden flex"
                style={{ width: entitiesWidth }}
              >
                <FamilyTreeLeftSidebar
                  onSelectNode={() => setInspectorOpen(true)}
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
                <div className="w-0.5 h-full min-h-[80px] bg-dark-accent/50 group-hover:bg-dark-accent transition-colors" />
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
              <FamilyTreeTextEditorWorkspace
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
                textScalePercent={activeTextScalePercent}
                onTextScalePercentChange={handleTextScalePercentChange}
                onRequestFileDeleteConfirm={setFileDeleteConfirm}
              />
            ) : (
              <>
                <FamilyTreeCanvas
                  panOnDrag={
                    !isResizingEntities &&
                    !styleEditorOpenUnionId &&
                    (!marqueeToolActive || isSpacePanning)
                  }
                  nodesDraggable={
                    !isResizingEntities &&
                    !styleEditorOpenUnionId &&
                    (!marqueeToolActive || isSpacePanning)
                  }
                  marqueeToolActive={marqueeToolActive}
                  isSpacePanning={isSpacePanning}
                  onNodeSelectForEdit={() => setInspectorOpen(true)}
                />
                {scriptPaneOpen && (
                  <div
                    className="flex-shrink-0 flex flex-col overflow-hidden"
                    style={{ height: scriptHeight }}
                  >
                    <div
                      role="separator"
                      aria-orientation="horizontal"
                      onPointerDown={handleScriptPointerDown}
                      className="h-2 flex-shrink-0 cursor-row-resize flex items-center justify-center group border-t border-dark-accent/50 hover:border-dark-accent/80 transition-colors select-none"
                    >
                      <div className="h-0.5 w-full min-w-[80px] bg-dark-accent/50 group-hover:bg-dark-accent transition-colors" />
                    </div>
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <FamilyTreeScriptPane drafts={textDrafts} onDraftsChange={setTextDrafts} />
                    </div>
                  </div>
                )}
                {!scriptPaneOpen && (
                  <button
                    onClick={() => setScriptPaneOpen(true)}
                    className="h-6 flex-shrink-0 bg-dark-accent/50 hover:bg-dark-accent border-t border-dark-accent flex items-center justify-center text-dark-muted hover:text-dark-text text-xs transition-colors"
                    title="Show Script"
                  >
                    Script
                  </button>
                )}
              </>
            )}
          </div>
          {inspectorOpen && !isTextEditor && <FamilyTreeInspector />}
        </div>
      </ErrorBoundary>
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
              {fileDeleteConfirm.personCount === 0 && fileDeleteConfirm.unionCount === 0 ? (
                <>no persons or unions from the project model (file is empty or has no declarations).</>
              ) : (
                <>
                  {fileDeleteConfirm.personCount > 0 && (
                    <>
                      {fileDeleteConfirm.personCount} person
                      {fileDeleteConfirm.personCount === 1 ? "" : "s"}
                    </>
                  )}
                  {fileDeleteConfirm.personCount > 0 && fileDeleteConfirm.unionCount > 0 && " and "}
                  {fileDeleteConfirm.unionCount > 0 && (
                    <>
                      {fileDeleteConfirm.unionCount} union
                      {fileDeleteConfirm.unionCount === 1 ? "" : "s"}
                    </>
                  )}{" "}
                  uniquely declared in this file. This cannot be undone.
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
