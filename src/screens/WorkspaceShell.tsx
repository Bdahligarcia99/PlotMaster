import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import TopBar from "../components/ui/TopBar";
import ModuleBadge from "../components/ui/ModuleBadge";
import ProjectSaveControls from "../components/ui/ProjectSaveControls";
import DisplayModeDropdown from "../components/ui/DisplayModeDropdown";
import ModuleSwitcherNavbar from "../components/ui/ModuleSwitcherNavbar";
import { getSupportedDisplayModes, type DisplayMode } from "../home/displayModes";
import { useWindowTitle } from "../hooks/useWindowTitle";
import { useAppStore } from "../store/appStore";
import { isTauri, openOrFocusIntroWindow } from "../tauri/openProjectInNewWindow";
import FamilyTreeCanvas from "../components/family-tree/FamilyTreeCanvas";
import FamilyTreeToolbar from "../components/family-tree/FamilyTreeToolbar";
import { useFamilyTreeStore } from "../store/familyTreeStore";
import FamilyTreeLeftSidebar from "../components/family-tree/FamilyTreeLeftSidebar";
import FamilyTreeScriptPane from "../components/family-tree/FamilyTreeScriptPane";
import FamilyTreeInspector from "../components/family-tree/FamilyTreeInspector";
import TimelineEntitiesPanel from "../components/timeline/TimelineEntitiesPanel";
import TimelineCanvasPlaceholder from "../components/timeline/TimelineCanvasPlaceholder";
import TimelineScriptPane from "../components/timeline/TimelineScriptPane";
import TimelineInspector from "../components/timeline/TimelineInspector";
import IdeasEntitiesPanel from "../components/ideas/IdeasEntitiesPanel";
import IdeasCanvasPlaceholder from "../components/ideas/IdeasCanvasPlaceholder";
import IdeasScriptPane from "../components/ideas/IdeasScriptPane";
import IdeasInspector from "../components/ideas/IdeasInspector";
import ChartsEntitiesPanel from "../components/charts/ChartsEntitiesPanel";
import ChartsToolbar from "../components/charts/ChartsToolbar";
import ChartsEditor from "../components/charts/ChartsEditor";
import ChartsScriptPane from "../components/charts/ChartsScriptPane";
import ChartsInspector from "../components/charts/ChartsInspector";

export default function WorkspaceShell() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [scriptPaneOpen, setScriptPaneOpen] = useState(true);

  const standaloneProjects = useAppStore((s) => s.standaloneProjects);
  const setIntroDialogOpen = useAppStore((s) => s.setIntroDialogOpen);
  const ensureStandaloneFromDriver = useAppStore((s) => s.ensureStandaloneFromDriver);

  const project = standaloneProjects.find((p) => p.id === id);
  const loadTree = useFamilyTreeStore((s) => s.loadTree);
  const primarySelectedNodeId = useFamilyTreeStore((s) => s.primarySelectedNodeId);
  const updateLastOpened = useAppStore((s) => s.updateLastOpened);
  const [hydrating, setHydrating] = useState(false);
  const lastUpdatedIdRef = useRef<string | null>(null);

  // Close properties pane when the selected node is deselected (Family Tree only)
  useEffect(() => {
    if (project?.moduleType === "Family Tree" && !primarySelectedNodeId) {
      setInspectorOpen(false);
    }
  }, [project?.moduleType, primarySelectedNodeId]);

  // When project not found, try hydrating from driver (e.g. charts from driver list)
  useEffect(() => {
    if (!id || project || hydrating) return;
    setHydrating(true);
    ensureStandaloneFromDriver(id).finally(() => setHydrating(false));
  }, [id, project, hydrating, ensureStandaloneFromDriver]);

  // Load tree and update lastOpened - run once per project to avoid infinite loop from store update
  useEffect(() => {
    if (!id || !project) return;
    if (lastUpdatedIdRef.current === id) return;
    lastUpdatedIdRef.current = id;
    if (project.moduleType === "Family Tree") {
      loadTree(id);
    }
    updateLastOpened("standalone", id);
  }, [id, project, loadTree, updateLastOpened]);

  const isFamilyTree = project?.moduleType === "Family Tree";
  const isTimeline = project?.moduleType === "Timeline";
  const isIdeas = project?.moduleType === "Ideas";
  const isCharts = project?.moduleType === "Charts" || project?.moduleType === "Profiles";
  const hasPanelLayout = isFamilyTree || isTimeline || isIdeas || isCharts;

  const moduleRegistryId =
    isFamilyTree ? "familyTree"
    : isCharts ? "charts"
    : isTimeline ? "timeline"
    : isIdeas ? "ideaPlayground"
    : "unknown";
  const supportedDisplayModes = getSupportedDisplayModes(moduleRegistryId);
  const activeDisplayMode: DisplayMode | undefined =
    supportedDisplayModes.length === 1
      ? supportedDisplayModes[0]
      : isTimeline
        ? "block"
        : supportedDisplayModes.includes("nodes")
          ? "nodes"
          : supportedDisplayModes.includes("charts")
            ? "charts"
            : supportedDisplayModes.includes("block")
              ? "block"
              : undefined;

  useWindowTitle(project ? `${project.name} - Synapse IWE` : "Synapse IWE");

  if (!project) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          {hydrating ? (
            <p className="text-dark-muted mb-4">Loading project…</p>
          ) : (
            <>
              <p className="text-dark-muted mb-4">Project not found</p>
              <Button onClick={() => navigate("/")}>Go Home</Button>
            </>
          )}
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
            <span className="text-dark-text font-medium truncate max-w-[200px]">{project.name}</span>
            <ModuleBadge label={project.moduleType} />
          </div>
        }
        children={
          id ? (
            <div className="flex items-center justify-center gap-3">
              <DisplayModeDropdown
                activeMode={activeDisplayMode}
                supportedModes={supportedDisplayModes}
                onSelect={() => {}}
              />
              <ModuleSwitcherNavbar currentProjectId={id} currentModuleType={project.moduleType} />
            </div>
          ) : undefined
        }
        right={
          <div className="flex items-center gap-2">
            <ProjectSaveControls
              activeProjectId={id ?? null}
              status={null}
              isSaving={false}
              showSavedCheck={false}
              saveAsFileProjectName={project.name}
            />
            <div className="h-4 w-px bg-dark-accent" />
            {hasPanelLayout && (
              <>
                <button
                  onClick={() => setLeftSidebarOpen((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    leftSidebarOpen
                      ? "bg-dark-accent border-dark-accent text-dark-text"
                      : "border-dark-accent text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
                  }`}
                  title={
                    leftSidebarOpen
                      ? isIdeas
                        ? "Hide Entities"
                        : "Hide Sub Entities"
                      : isIdeas
                        ? "Show Entities"
                        : "Show Sub Entities"
                  }
                >
                  {isIdeas ? "Entities" : "Sub Entities"}
                </button>
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
              </>
            )}
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
          </div>
        }
      />

      <div className="flex-1 flex min-h-0 flex-col">
        {isFamilyTree ? (
          <>
            <FamilyTreeToolbar />
            <div className="flex-1 flex min-h-0">
              <div
                className="flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out flex"
                style={{ width: leftSidebarOpen ? 260 : 0 }}
              >
                <FamilyTreeLeftSidebar onSelectNode={() => setInspectorOpen(true)} />
              </div>
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
                <FamilyTreeCanvas onNodeSelectForEdit={() => setInspectorOpen(true)} />
                <div
                  className="flex-shrink-0 overflow-hidden transition-[height] duration-200 ease-in-out"
                  style={{ height: scriptPaneOpen ? 240 : 0 }}
                >
                  <FamilyTreeScriptPane />
                </div>
                {!scriptPaneOpen && (
                  <button
                    onClick={() => setScriptPaneOpen(true)}
                    className="h-6 flex-shrink-0 bg-dark-accent/50 hover:bg-dark-accent border-t border-dark-accent flex items-center justify-center text-dark-muted hover:text-dark-text text-xs transition-colors"
                    title="Show Script"
                  >
                    Script
                  </button>
                )}
              </div>
              {inspectorOpen && <FamilyTreeInspector />}
            </div>
          </>
        ) : isTimeline ? (
          <div className="flex-1 flex min-h-0 relative">
            <div
              className="flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out flex"
              style={{ width: leftSidebarOpen ? 260 : 0 }}
            >
              <TimelineEntitiesPanel />
            </div>
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
              <TimelineCanvasPlaceholder />
              <div
                className="flex-shrink-0 overflow-hidden transition-[height] duration-200 ease-in-out"
                style={{ height: scriptPaneOpen ? 240 : 0 }}
              >
                <TimelineScriptPane />
              </div>
              {!scriptPaneOpen && (
                <button
                  onClick={() => setScriptPaneOpen(true)}
                  className="h-6 flex-shrink-0 bg-dark-accent/50 hover:bg-dark-accent border-t border-dark-accent flex items-center justify-center text-dark-muted hover:text-dark-text text-xs transition-colors"
                  title="Show Script"
                >
                  Script
                </button>
              )}
            </div>
            {inspectorOpen && <TimelineInspector />}
          </div>
        ) : isIdeas ? (
          <div className="flex-1 flex min-h-0">
            <div
              className="flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out flex"
              style={{ width: leftSidebarOpen ? 260 : 0 }}
            >
              <IdeasEntitiesPanel />
            </div>
            {!leftSidebarOpen && (
              <button
                onClick={() => setLeftSidebarOpen(true)}
                className="w-7 flex-shrink-0 bg-dark-accent/50 hover:bg-dark-accent border-r border-dark-accent flex items-center justify-center text-dark-muted hover:text-dark-text transition-colors"
                title="Show Entities"
              >
                <span className="text-xs font-medium transform -rotate-90 whitespace-nowrap origin-center">
                  Entities
                </span>
              </button>
            )}
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <IdeasCanvasPlaceholder />
              <div
                className="flex-shrink-0 overflow-hidden transition-[height] duration-200 ease-in-out"
                style={{ height: scriptPaneOpen ? 240 : 0 }}
              >
                <IdeasScriptPane />
              </div>
              {!scriptPaneOpen && (
                <button
                  onClick={() => setScriptPaneOpen(true)}
                  className="h-6 flex-shrink-0 bg-dark-accent/50 hover:bg-dark-accent border-t border-dark-accent flex items-center justify-center text-dark-muted hover:text-dark-text text-xs transition-colors"
                  title="Show Script"
                >
                  Script
                </button>
              )}
            </div>
            {inspectorOpen && <IdeasInspector />}
          </div>
        ) : isCharts ? (
          <>
            <ChartsToolbar />
            <div className="flex-1 flex min-h-0">
              <div
                className="flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out flex"
                style={{ width: leftSidebarOpen ? 260 : 0 }}
              >
                <ChartsEntitiesPanel />
              </div>
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
              <ChartsEditor />
              <div
                className="flex-shrink-0 overflow-hidden transition-[height] duration-200 ease-in-out"
                style={{ height: scriptPaneOpen ? 240 : 0 }}
              >
                <ChartsScriptPane />
              </div>
              {!scriptPaneOpen && (
                <button
                  onClick={() => setScriptPaneOpen(true)}
                  className="h-6 flex-shrink-0 bg-dark-accent/50 hover:bg-dark-accent border-t border-dark-accent flex items-center justify-center text-dark-muted hover:text-dark-text text-xs transition-colors"
                  title="Show Script"
                >
                  Script
                </button>
              )}
            </div>
            {inspectorOpen && <ChartsInspector />}
          </div>
          </>
        ) : (
          <>
            <div className="flex-1 flex min-h-0">
              <div className="flex-1 m-4 rounded-xl border-2 border-dashed border-dark-accent/50 flex items-center justify-center bg-dark-surface/30">
                <div className="text-center text-dark-muted">
                  <p className="text-sm font-medium">{project.moduleType} Canvas</p>
                  <p className="text-xs mt-1">Placeholder — Phase 2</p>
                </div>
              </div>
              {inspectorOpen && (
                <div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto">
                  <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide mb-3">
                    Inspector
                  </h3>
                  <p className="text-dark-muted text-xs">
                    Select a node to edit properties.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
