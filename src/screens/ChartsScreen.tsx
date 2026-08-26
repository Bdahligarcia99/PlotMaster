import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import TopBar from "../components/ui/TopBar";
import ModuleBadge from "../components/ui/ModuleBadge";
import DisplayModeDropdown from "../components/ui/DisplayModeDropdown";
import ModuleSwitcherNavbar from "../components/ui/ModuleSwitcherNavbar";
import CoreModuleNavbar from "../components/ui/CoreModuleNavbar";
import ProjectSaveControls from "../components/ui/ProjectSaveControls";
import ChartsToolbar from "../components/charts/ChartsToolbar";
import ChartsEntitiesPanel from "../components/charts/ChartsEntitiesPanel";
import ChartsEditor from "../components/charts/ChartsEditor";
import ChartsScriptPane from "../components/charts/ChartsScriptPane";
import ChartsInspector from "../components/charts/ChartsInspector";
import ChartsTextEditorWorkspace, {
  commitChartsDrafts,
  type TextEditorDrafts,
  type TextEditorPane,
} from "../components/charts/ChartsTextEditorWorkspace";
import { resolveOwnerProjectContext } from "../home/ownerProjectContext";
import { useWindowTitle } from "../hooks/useWindowTitle";
import { useAppStore } from "../store/appStore";
import { useChartsStore } from "../store/chartsStore";
import type { ChartsEntryKind } from "../store/chartsDocumentHelpers";
import { isTauri, openOrFocusIntroWindow } from "../tauri/openProjectInNewWindow";
import { DEFAULT_BEAT_TEXT_SCALE_PERCENT } from "../store/timelineTypes";

export default function ChartsScreen() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ownerContext = useMemo(
    () => (projectId ? resolveOwnerProjectContext(projectId) : null),
    [projectId]
  );

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [scriptPaneOpen, setScriptPaneOpen] = useState(true);
  const [textDrafts, setTextDrafts] = useState<TextEditorDrafts>({});
  const [panes, setPanes] = useState<TextEditorPane[]>([]);
  const [activePaneId, setActivePaneId] = useState<string | null>(null);
  const [unifiedScroll, setUnifiedScroll] = useState(false);
  const [textScalePercent, setTextScalePercent] = useState(DEFAULT_BEAT_TEXT_SCALE_PERCENT);
  const [textEditorCommitError, setTextEditorCommitError] = useState<string | null>(null);
  const [kindMismatchMessage, setKindMismatchMessage] = useState<string | null>(null);
  const [newFolderKind, setNewFolderKind] = useState<ChartsEntryKind>("chart");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderDeleteConfirm, setFolderDeleteConfirm] = useState<{
    folderId: string;
    folderName: string;
  } | null>(null);
  const [projectName, setProjectName] = useState("Charts");

  const setIntroDialogOpen = useAppStore((s) => s.setIntroDialogOpen);
  const standaloneProjects = useAppStore((s) => s.standaloneProjects);
  const updateLastOpened = useAppStore((s) => s.updateLastOpened);

  const setActiveProject = useChartsStore((s) => s.setActiveProject);
  const displayMode = useChartsStore((s) => s.displayMode);
  const setDisplayMode = useChartsStore((s) => s.setDisplayMode);
  const applyChartsDocumentEdits = useChartsStore((s) => s.applyChartsDocumentEdits);
  const createDocument = useChartsStore((s) => s.createDocument);
  const createFolder = useChartsStore((s) => s.createFolder);
  const renameFolder = useChartsStore((s) => s.renameFolder);
  const deleteFolderCascade = useChartsStore((s) => s.deleteFolderCascade);
  const deleteDocument = useChartsStore((s) => s.deleteDocument);

  const isTextEditor = displayMode === "text";
  const prevDisplayModeRef = useRef(displayMode);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const project = standaloneProjects.find((p) => p.id === projectId);

  useEffect(() => {
    if (projectId) {
      setActiveProject(projectId);
      updateLastOpened("standalone", projectId);
    }
    return () => setActiveProject(null);
  }, [projectId, setActiveProject, updateLastOpened]);

  useEffect(() => {
    if (project?.name) setProjectName(project.name);
  }, [project?.name]);

  useWindowTitle(projectName ? `${projectName} - Synapse IWE` : "Synapse IWE");

  const openFileIds = useMemo(
    () => panes.map((p) => p.docId).filter((id): id is string => id != null),
    [panes]
  );
  const activePane = activePaneId ? panes.find((p) => p.paneId === activePaneId) ?? null : null;
  const activeFileId = activePane?.docId ?? null;
  const dirtyDocIds = useMemo(
    () => new Set(Object.entries(textDrafts).filter(([, d]) => d.dirty).map(([id]) => id)),
    [textDrafts]
  );
  const hasDraftChanges = dirtyDocIds.size > 0;

  const commitAllDirtyDrafts = useCallback((): { ok: boolean } => {
    const result = commitChartsDrafts(textDrafts, applyChartsDocumentEdits);
    if (!result.ok) {
      setTextEditorCommitError(result.errors.join("; "));
      return { ok: false };
    }
    setTextDrafts(result.nextDrafts);
    setTextEditorCommitError(null);
    return { ok: true };
  }, [textDrafts, applyChartsDocumentEdits]);

  const commitRef = useRef(commitAllDirtyDrafts);
  commitRef.current = commitAllDirtyDrafts;

  useEffect(() => {
    if (!hasDraftChanges) return;
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitRef.current();
    }, 800);
    return () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    };
  }, [textDrafts, hasDraftChanges]);

  useEffect(() => {
    if (prevDisplayModeRef.current === displayMode) return;
    prevDisplayModeRef.current = displayMode;
    queueMicrotask(() => commitRef.current());
  }, [displayMode]);

  useEffect(() => {
    return () => {
      commitRef.current();
    };
  }, []);

  const handleOpenFile = useCallback(
    (docId: string) => {
      const existingPane = panes.find((p) => p.docId === docId);
      if (existingPane && existingPane.paneId === activePaneId) return;
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

  const handleNewUserFile = (kind: ChartsEntryKind, folderId?: string) => {
    const id = createDocument(kind, folderId);
    handleOpenFile(id);
  };

  const handleRequestNewFolder = (kind: ChartsEntryKind) => {
    setNewFolderKind(kind);
    setNewFolderName(kind === "chart" ? "Charts" : "Layouts");
    setNewFolderOpen(true);
  };

  const handleCreateFolder = () => {
    createFolder(newFolderName, newFolderKind);
    setNewFolderOpen(false);
  };

  const handleRequestFolderDelete = (folderId: string, folderName: string) => {
    setFolderDeleteConfirm({ folderId, folderName });
  };

  const handleConfirmFolderDelete = () => {
    if (!folderDeleteConfirm) return;
    const result = deleteFolderCascade(folderDeleteConfirm.folderId);
    if (!result.ok) {
      setKindMismatchMessage("Cannot delete the last folder of this type.");
    }
    setFolderDeleteConfirm(null);
  };

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
                if (isTauri()) openOrFocusIntroWindow();
                else setIntroDialogOpen(true);
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
            <span className="text-dark-text font-medium truncate max-w-[200px]">{projectName}</span>
            <ModuleBadge label="Charts" />
          </div>
        }
        children={
          <div className="flex items-center justify-center gap-3">
            {ownerContext && (
              <>
                <CoreModuleNavbar
                  ownerProjectId={ownerContext.ownerId}
                  ownerType={ownerContext.ownerType}
                  neuronId={ownerContext.neuronId}
                  projectName={ownerContext.projectName}
                />
                <div className="h-4 w-px bg-dark-accent" />
              </>
            )}
            <DisplayModeDropdown
              activeMode={displayMode}
              supportedModes={["charts", "text"]}
              onSelect={(mode) => setDisplayMode(mode === "text" ? "text" : "charts")}
            />
            <ModuleSwitcherNavbar currentProjectId={projectId} currentModuleType="Charts" />
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <ProjectSaveControls
              activeProjectId={projectId}
              status={
                hasDraftChanges
                  ? { text: "Unsaved script changes", isError: false }
                  : textEditorCommitError
                    ? { text: textEditorCommitError, isError: true }
                    : null
              }
              isSaving={false}
              showSavedCheck={false}
              saveAsFileProjectName={projectName}
            />
            <div className="h-4 w-px bg-dark-accent" />
            <button
              onClick={() => setLeftSidebarOpen((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                leftSidebarOpen
                  ? "bg-dark-accent border-dark-accent text-dark-text"
                  : "border-dark-accent text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
              }`}
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
                  onClick={() => setInspectorOpen((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg border transition-colors ${
                    inspectorOpen
                      ? "bg-dark-accent border-dark-accent text-dark-text"
                      : "border-dark-accent text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
                  }`}
                >
                  Inspector
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="flex-1 flex min-h-0 flex-col">
        {!isTextEditor && <ChartsToolbar />}
        <div className="flex-1 flex min-h-0">
          {leftSidebarOpen && (
            <div className="w-[260px] flex-shrink-0 overflow-hidden">
              <ChartsEntitiesPanel
                textEditorMode={isTextEditor}
                openFileIds={openFileIds}
                activeFileId={activeFileId}
                dirtyDocIds={dirtyDocIds}
                onOpenFile={handleOpenFile}
                onNewUserFile={handleNewUserFile}
                onDeleteUserFile={deleteDocument}
                onRequestNewFolder={handleRequestNewFolder}
                onRequestFolderDelete={handleRequestFolderDelete}
                onRenameFolder={renameFolder}
                onKindMismatch={setKindMismatchMessage}
              />
            </div>
          )}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {isTextEditor ? (
              <>
                {textEditorCommitError && (
                  <div className="px-3 py-2 text-xs text-red-400 border-b border-red-500/30 bg-red-500/10 shrink-0">
                    {textEditorCommitError}
                  </div>
                )}
                <ChartsTextEditorWorkspace
                  drafts={textDrafts}
                  onDraftsChange={setTextDrafts}
                  panes={panes}
                  onPanesChange={setPanes}
                  activePaneId={activePaneId}
                  onActivePaneIdChange={setActivePaneId}
                  unifiedScroll={unifiedScroll}
                  onUnifiedScrollChange={setUnifiedScroll}
                  textScalePercent={textScalePercent}
                  onTextScalePercentChange={setTextScalePercent}
                  onCommitError={(errors) =>
                    setTextEditorCommitError(errors?.join("; ") ?? null)
                  }
                />
              </>
            ) : (
              <>
                <ChartsEditor />
                {scriptPaneOpen && (
                  <div className="h-[240px] shrink-0 border-t border-dark-accent/50">
                    <ChartsScriptPane />
                  </div>
                )}
              </>
            )}
          </div>
          {inspectorOpen && !isTextEditor && <ChartsInspector />}
        </div>
      </div>

      <Modal
        isOpen={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title="New folder"
      >
        <div className="space-y-3">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm"
            placeholder="Folder name"
          />
          <p className="text-xs text-dark-muted">
            Type: {newFolderKind === "chart" ? "Chart files" : "Layout files"}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateFolder}>
              Create
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={folderDeleteConfirm != null}
        onClose={() => setFolderDeleteConfirm(null)}
        title="Delete folder"
      >
        <p className="text-sm text-dark-text mb-4">
          Delete folder &quot;{folderDeleteConfirm?.folderName}&quot; and all files inside?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setFolderDeleteConfirm(null)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={handleConfirmFolderDelete}>
            Delete
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={kindMismatchMessage != null}
        onClose={() => setKindMismatchMessage(null)}
        title="Move blocked"
      >
        <p className="text-sm text-dark-text mb-4">{kindMismatchMessage}</p>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={() => setKindMismatchMessage(null)}>
            OK
          </Button>
        </div>
      </Modal>
    </div>
  );
}
