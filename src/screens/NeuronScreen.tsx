import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import TopBar from "../components/ui/TopBar";
import ModuleBadge from "../components/ui/ModuleBadge";
import DisplayModeDropdown from "../components/ui/DisplayModeDropdown";
import ModuleSwitcherNavbar from "../components/ui/ModuleSwitcherNavbar";
import CoreModuleNavbar from "../components/ui/CoreModuleNavbar";
import { resolveOwnerProjectContext } from "../home/ownerProjectContext";
import { useWindowTitle } from "../hooks/useWindowTitle";
import { useNeuronStore } from "../store/neuronStore";
import { useAppStore } from "../store/appStore";
import { getStorageDriver } from "../storage/StorageDriver";
import { isTauri, openOrFocusIntroWindow } from "../tauri/openProjectInNewWindow";
import NeuronEntitiesPanel from "../components/neuron/NeuronEntitiesPanel";
import NeuronEditorWorkspace, {
  paneIdFromRef,
  type NeuronDrafts,
  type NeuronEditorPane,
  type NeuronPaneRef,
} from "../components/neuron/NeuronEditorWorkspace";
import NeuronInspector, { type NeuronSelectionTarget } from "../components/neuron/NeuronInspector";
import NeuronSaveControls from "../components/neuron/NeuronSaveControls";
import { DEFAULT_BEAT_TEXT_SCALE_PERCENT } from "../store/timelineTypes";

const UNIFORM_PANE_WIDTH_DEFAULT_PX = 420;

export default function NeuronScreen() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const loadProject = useNeuronStore((s) => s.loadProject);
  const saveProject = useNeuronStore((s) => s.saveProject);
  const projectName = useNeuronStore((s) => s.projectName);
  const setProjectName = useNeuronStore((s) => s.setProjectName);
  const setMirrors = useNeuronStore((s) => s.setMirrors);
  const loading = useNeuronStore((s) => s.loading);
  const setIntroDialogOpen = useAppStore((s) => s.setIntroDialogOpen);
  const updateLastOpened = useAppStore((s) => s.updateLastOpened);
  const findOwnerProjectId = useAppStore((s) => s.findOwnerProjectId);

  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [entitiesWidth] = useState(280);
  const [inspectorWidth] = useState(300);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [panes, setPanes] = useState<NeuronEditorPane[]>([]);
  const [activePaneId, setActivePaneId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<NeuronDrafts>({});
  const [inspectorSelection, setInspectorSelection] = useState<NeuronSelectionTarget | null>(null);
  const [unifiedScroll, setUnifiedScroll] = useState(false);
  const [unifiedSelectionIds, setUnifiedSelectionIds] = useState<string[]>([]);
  const [paneFractions, setPaneFractions] = useState<number[]>([]);
  const [uniformPaneWidth, setUniformPaneWidth] = useState(false);
  const [uniformPaneWidthPx, setUniformPaneWidthPx] = useState(UNIFORM_PANE_WIDTH_DEFAULT_PX);
  const [sideBySideTextScalePercent, setSideBySideTextScalePercent] = useState(
    DEFAULT_BEAT_TEXT_SCALE_PERCENT
  );
  const [unifiedTextScalePercent, setUnifiedTextScalePercent] = useState(
    DEFAULT_BEAT_TEXT_SCALE_PERCENT
  );

  const ownerContext = useMemo(() => {
    if (!projectId) return null;
    return resolveOwnerProjectContext(projectId);
  }, [projectId]);

  const subProjects = ownerContext?.subProjects ?? {};

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

  useWindowTitle(projectName ? `${projectName} - Synapse IWE` : "Synapse IWE");

  const loadMirrors = useCallback(async () => {
    if (!ownerContext) return;
    const driver = getStorageDriver();
    const loaded: Record<string, Awaited<ReturnType<typeof driver.loadProjectData>>> = {};
    for (const [, subId] of Object.entries(ownerContext.subProjects)) {
      const data = await driver.loadProjectData(subId);
      if (data) loaded[subId] = data;
    }
    setMirrors(loaded as Record<string, NonNullable<(typeof loaded)[string]>>);
  }, [ownerContext, setMirrors]);

  useEffect(() => {
    if (!projectId) return;
    void loadProject(projectId).then(() => {
      const owner = findOwnerProjectId(projectId);
      if (owner) updateLastOpened(owner.ownerType, owner.ownerId);
      else updateLastOpened("standalone", projectId);
    });
  }, [projectId, loadProject, findOwnerProjectId, updateLastOpened]);

  useEffect(() => {
    void loadMirrors();
    const onFocus = () => void loadMirrors();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadMirrors]);

  const openPane = useCallback(
    (ref: NeuronPaneRef) => {
      const id = paneIdFromRef(ref);
      const existingPane = panes.find((p) => p.id === id);

      if (existingPane && existingPane.id === activePaneId) {
        return;
      }

      if (existingPane) {
        setActivePaneId(existingPane.id);
        return;
      }

      if (activePaneId) {
        setPanes((prev) => prev.map((p) => (p.id === activePaneId ? { id, ref } : p)));
        setActivePaneId(id);
        return;
      }

      setPanes((prev) => [...prev, { id, ref }]);
      setActivePaneId(id);
    },
    [panes, activePaneId]
  );

  const closePane = useCallback(
    (paneId: string) => {
      setPanes((prev) => {
        const next = prev.filter((p) => p.id !== paneId);
        if (activePaneId === paneId) {
          setActivePaneId(next[0]?.id ?? null);
        }
        return next;
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[paneId];
        return next;
      });
    },
    [activePaneId]
  );

  const handleDraftChange = useCallback((paneId: string, content: string, dirty = true) => {
    setDrafts((prev) => ({
      ...prev,
      [paneId]: { content, dirty },
    }));
  }, []);

  const handleSaveName = async () => {
    const trimmed = editNameValue.trim();
    if (!trimmed || !projectId || trimmed === projectName) {
      setIsEditingName(false);
      return;
    }
    setProjectName(trimmed);
    await getStorageDriver().updateProjectMeta(projectId, { name: trimmed, updatedAt: Date.now() });
    await saveProject();
    setIsEditingName(false);
  };

  const dirtyPaneIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, d] of Object.entries(drafts)) {
      if (d.dirty) set.add(id);
    }
    return set;
  }, [drafts]);

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

  const ownerId = ownerContext?.ownerId ?? projectId;
  const ownerType = ownerContext?.ownerType ?? "standalone";

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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
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
                onClick={() => {
                  setEditNameValue(projectName);
                  setIsEditingName(true);
                }}
                className="text-dark-text font-medium truncate max-w-[200px] text-left hover:text-blue-400 transition-colors"
                title="Click to rename"
              >
                {projectName}
              </button>
            )}
            <ModuleBadge label="Neuron" />
          </div>
        }
        children={
          <div className="flex items-center justify-center gap-3">
            {ownerContext && (
              <>
                <CoreModuleNavbar
                  ownerProjectId={ownerId}
                  ownerType={ownerType}
                  neuronId={projectId}
                  projectName={ownerContext.projectName}
                  activeCoreModule="neuron"
                />
                <div className="h-4 w-px bg-dark-accent" />
              </>
            )}
            <DisplayModeDropdown activeMode="text" supportedModes={["text"]} onSelect={() => {}} />
            {Object.keys(subProjects).length > 0 && (
              <ModuleSwitcherNavbar currentProjectId={projectId} currentModuleType="Neuron" />
            )}
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <NeuronSaveControls />
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
            <button
              onClick={() => setInspectorOpen((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center ${
                inspectorOpen
                  ? "bg-dark-accent border-dark-accent text-dark-text"
                  : "border-dark-accent text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
              }`}
              title={inspectorOpen ? "Hide Inspector" : "Show Inspector"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0">
        {leftSidebarOpen && (
          <div style={{ width: entitiesWidth }} className="shrink-0 min-h-0 flex flex-col">
            <NeuronEntitiesPanel
              subProjects={subProjects}
              activePaneId={activePaneId}
              unifiedSelectionIds={unifiedSelectionIds}
              dirtyPaneIds={dirtyPaneIds}
              onOpenPane={openPane}
              onUnifiedSelectionChange={setUnifiedSelectionIds}
              onSelectForInspector={setInspectorSelection}
              onRequestInspectorOpen={() => setInspectorOpen(true)}
            />
          </div>
        )}

        <NeuronEditorWorkspace
          subProjects={subProjects}
          panes={panes}
          activePaneId={activePaneId}
          unifiedScroll={unifiedScroll}
          onUnifiedScrollChange={setUnifiedScroll}
          unifiedSelectionIds={unifiedSelectionIds}
          drafts={drafts}
          onDraftChange={handleDraftChange}
          onActivePaneChange={setActivePaneId}
          onClosePane={closePane}
          onPanesChange={setPanes}
          paneFractions={paneFractions}
          onPaneFractionsChange={setPaneFractions}
          uniformPaneWidth={uniformPaneWidth}
          onUniformPaneWidthChange={setUniformPaneWidth}
          uniformPaneWidthPx={uniformPaneWidthPx}
          onUniformPaneWidthPxChange={setUniformPaneWidthPx}
          textScalePercent={activeTextScalePercent}
          onTextScalePercentChange={handleTextScalePercentChange}
        />

        {inspectorOpen && (
          <div
            style={{ width: inspectorWidth }}
            className="shrink-0 border-l border-dark-accent bg-dark-surface min-h-0 overflow-hidden"
          >
            <NeuronInspector selection={inspectorSelection} />
          </div>
        )}
      </div>
    </div>
  );
}
