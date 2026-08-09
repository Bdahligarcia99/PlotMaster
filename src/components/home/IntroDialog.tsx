import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ModeSwitchNavbar from "../ui/ModeSwitchNavbar";
import ProjectScopeBox from "./ProjectScopeBox";
import { getStorageDriver } from "../../storage/StorageDriver";
import type { ProjectIndexItem } from "../../storage/StorageDriver";
import { createProject, createTimelineProject } from "../../home/createProject";
import { getRegistryItemForModuleKey, MODULE_ID_TO_TYPE } from "../../home/moduleRegistry";
import { getModuleRoute, moduleIdToTypeName } from "../../home/moduleRoutes";
import { getSynprojFileIO } from "../../storage/synproj/synprojFileIO";
import {
  initializeFileBackedModularProject,
  initializeFileBackedStandaloneProject,
  registerProjectFileRef,
  unregisterProjectFileRef,
  openSynprojFileAndRegister,
} from "../../storage/synproj/synprojProjectService";
import { useAppStore, type Project } from "../../store/appStore";
import {
  buildRecentsList,
  getModuleCount,
  type RecentModularEntry,
} from "../../home/recentsGrouping";
import { getRecentsFilter, setRecentsFilter, type RecentsFilter } from "../../home/recentsFilterPrefs";
import {
  isTauri,
  openProjectInNewWindow,
} from "../../tauri/openProjectInNewWindow";
import { APP_RELEASE_CHANNEL, APP_VERSION } from "../../constants/appMeta";

type DeleteTarget =
  | { id: string; name: string; source: "driver" | "standalone" }
  | { id: string; name: string; source: "modular"; subProjectIds: string[] };
type TabId = "create" | "recent";

function formatLastOpened(timestamp: number) {
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ModuleIconPlaceholder() {
  return (
    <div className="w-8 h-8 rounded-lg bg-dark-accent flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4 text-dark-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </div>
  );
}

const MODULE_LABELS: Record<string, string> = {
  familyTree: "Family Tree",
  timeline: "Timeline Outliner",
  Timeline: "Timeline Outliner",
  charts: "Charts",
  characterProfiles: "Charts",
  Charts: "Charts",
  Profiles: "Charts",
  ideaPlayground: "Ideas Playground",
  ideas: "Ideas Playground",
  Ideas: "Ideas Playground",
};

interface IntroDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** When true, show close X (e.g. when a project is loaded and dialog overlays workspace) */
  canClose?: boolean;
  /** When true, render as standalone window content (no overlay, fills viewport). Used for Tauri intro window. */
  standalone?: boolean;
}

export default function IntroDialog({
  isOpen,
  onClose,
  canClose = false,
  standalone = false,
}: IntroDialogProps) {
  const initialFocusRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("create");
  const [allProjects, setAllProjects] = useState<ProjectIndexItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [openProjectError, setOpenProjectError] = useState<string | null>(null);
  const [openingProject, setOpeningProject] = useState(false);
  const [recentsFilter, setRecentsFilterState] = useState<RecentsFilter>(() => getRecentsFilter());

  const standaloneProjects = useAppStore((s) => s.standaloneProjects);
  const modularProjects = useAppStore((s) => s.modularProjects);
  const removeStandaloneProject = useAppStore((s) => s.removeStandaloneProject);
  const removeModularProject = useAppStore((s) => s.removeModularProject);
  const setIntroDialogOpen = useAppStore((s) => s.setIntroDialogOpen);
  const createStandaloneProject = useAppStore((s) => s.createStandaloneProject);
  const createModularProject = useAppStore((s) => s.createModularProject);

  const recentEntries = buildRecentsList(modularProjects, allProjects, standaloneProjects);

  const filteredRecentEntries = recentEntries.filter((entry) => {
    const count = getModuleCount(entry);
    if (recentsFilter === "single") return count === 1;
    if (recentsFilter === "multi") return count >= 2;
    return true;
  });

  const handleRecentsFilterChange = (filter: RecentsFilter) => {
    setRecentsFilterState(filter);
    setRecentsFilter(filter);
  };

  const tabCreateRef = useRef<HTMLButtonElement>(null);
  const tabRecentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      getStorageDriver().listProjects().then((list) => setAllProjects(list));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === "create") {
      const timer = setTimeout(() => {
        initialFocusRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (canClose) {
          e.preventDefault();
          onClose();
        }
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, canClose, onClose]);

  const refreshProjects = () => {
    getStorageDriver().listProjects().then((list) => setAllProjects(list));
  };

  const openInNewWindow = (path: string) => {
    if (isTauri()) {
      openProjectInNewWindow(path, { closeCurrent: false });
    } else {
      window.open(`${window.location.origin}${path}`, "_blank", "noopener,noreferrer");
    }
  };

  const handleCreateProject = async (
    projectName: string,
    enabledModules: string[],
    storageMode: "localStorage" | "file" = "localStorage"
  ) => {
    const name = projectName.trim();
    if (!name || enabledModules.length === 0) return;

    let fileRef: string | null = null;
    if (storageMode === "file") {
      try {
        fileRef = await getSynprojFileIO().pickSaveLocation(name);
        if (!fileRef) return;
      } catch (e) {
        console.error("[IntroDialog] File picker failed:", e);
        return;
      }
    }

    refreshProjects();
    setIntroDialogOpen(false);
    onClose();

    if (enabledModules.length === 1) {
      if (enabledModules[0] === "familyTree") {
        const id = await createProject(name, ["familyTree"]);
        if (fileRef) {
          const driver = getStorageDriver();
          await driver.updateProjectMeta(id, { storageMode: "file", fileRef });
          registerProjectFileRef(id, fileRef);
          await initializeFileBackedStandaloneProject(id, name, "familyTree", fileRef);
        }
        openInNewWindow(`/family-tree/${id}`);
      } else if (enabledModules[0] === "charts") {
        const id = createStandaloneProject(name, "Charts");
        if (fileRef) {
          await initializeFileBackedStandaloneProject(id, name, "Charts", fileRef);
        }
        openInNewWindow(`/project/${id}`);
      } else if (enabledModules[0] === "timeline") {
        const id = await createTimelineProject(name);
        if (fileRef) {
          const driver = getStorageDriver();
          await driver.updateProjectMeta(id, { storageMode: "file", fileRef });
          registerProjectFileRef(id, fileRef);
          await initializeFileBackedStandaloneProject(id, name, "timeline", fileRef);
        }
        openInNewWindow(`/timeline/${id}`);
      } else if (enabledModules[0] === "ideaPlayground") {
        const id = createStandaloneProject(name, "Ideas");
        if (fileRef) {
          await initializeFileBackedStandaloneProject(id, name, "Ideas", fileRef);
        }
        openInNewWindow(`/project/${id}`);
      }
    } else {
      const subProjects: Record<string, string> = {};
      const moduleNames: string[] = [];

      for (const moduleId of enabledModules) {
        const typeName = MODULE_ID_TO_TYPE[moduleId] ?? moduleIdToTypeName(moduleId);
        moduleNames.push(typeName);

        if (moduleId === "familyTree") {
          subProjects[typeName] = await createProject(name, ["familyTree"]);
        } else if (moduleId === "timeline") {
          subProjects[typeName] = await createTimelineProject(name);
        } else if (moduleId === "charts") {
          subProjects[typeName] = createStandaloneProject(name, "Charts");
        }
      }

      const modularId = createModularProject(name, moduleNames, subProjects);

      if (fileRef) {
        const modularProject: Project = {
          id: modularId,
          name,
          enabledModules: moduleNames,
          subProjects,
          lastOpened: Date.now(),
          storageMode: "file",
          fileRef,
        };
        await initializeFileBackedModularProject(modularProject, fileRef);
      }

      const firstModuleId = enabledModules[0];
      const firstTypeName = MODULE_ID_TO_TYPE[firstModuleId] ?? moduleIdToTypeName(firstModuleId);
      const firstSubId = subProjects[firstTypeName];
      if (firstSubId) {
        openInNewWindow(getModuleRoute(firstTypeName, firstSubId));
      }
    }
  };

  const handleOpenProjectFile = async () => {
    setOpenProjectError(null);
    setOpeningProject(true);
    try {
      const result = await openSynprojFileAndRegister();
      if (!result) return;
      refreshProjects();
      setIntroDialogOpen(false);
      onClose();
      openInNewWindow(result.path);
    } catch (e) {
      console.error("[IntroDialog] Open project failed:", e);
      setOpenProjectError(e instanceof Error ? e.message : "Failed to open project file.");
    } finally {
      setOpeningProject(false);
    }
  };

  /** Opens a specific module of a modular (multi-module) project directly. */
  const handleOpenModule = (typeName: string, subProjectId: string) => {
    setIntroDialogOpen(false);
    onClose();
    openInNewWindow(getModuleRoute(typeName, subProjectId));
  };

  /** Card's primary "Open" — opens the first module in canonical order. */
  const handleOpenModular = (entry: RecentModularEntry) => {
    const first = entry.modules[0];
    if (!first) return;
    handleOpenModule(first.typeName, first.subProjectId);
  };

  const isProjectRoute = (id: string) =>
    location.pathname === `/project/${id}` ||
    location.pathname === `/family-tree/${id}` ||
    location.pathname === `/timeline/${id}`;

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const { id } = target;
    setDeleteTarget(null);
    let deletedIds = [id];
    if (target.source === "driver") {
      await getStorageDriver().deleteProject(id);
      refreshProjects();
    } else if (target.source === "standalone") {
      removeStandaloneProject(id);
      await getStorageDriver().deleteProject(id);
    } else if (target.source === "modular") {
      // Modular: cascade-delete every sub-project, then the modular entry itself.
      for (const subId of target.subProjectIds) {
        await getStorageDriver().deleteProject(subId);
        removeStandaloneProject(subId);
        unregisterProjectFileRef(subId);
      }
      removeModularProject(id);
      unregisterProjectFileRef(id);
      deletedIds = [id, ...target.subProjectIds];
      refreshProjects();
    }
    if (deletedIds.some(isProjectRoute)) {
      navigate("/");
    }
  };

  if (!isOpen) return null;

  const card = (
      <div
        className={`bg-dark-surface flex flex-col overflow-hidden
          ${standalone
            ? "min-h-screen w-full rounded-none border-0"
            : "rounded-2xl border border-dark-accent/50 shadow-2xl w-full max-w-[920px] max-h-[70vh]"
          }`}
        onClick={standalone ? undefined : (e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 id="intro-dialog-title" className="text-2xl font-bold text-dark-text tracking-wider">
                SYNAPSE IWE
              </h1>
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300/95 bg-amber-500/15 border border-amber-400/45 px-2 py-0.5 rounded-md"
                title="Synapse IWE is in early development."
              >
                {APP_RELEASE_CHANNEL}
              </span>
            </div>
            <p className="text-dark-muted text-sm mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>Project selection</span>
              <span className="text-dark-accent/60" aria-hidden>
                ·
              </span>
              <span className="tabular-nums text-dark-muted/90" title={`Synapse IWE ${APP_VERSION}`}>
                v{APP_VERSION}
              </span>
            </p>
          </div>
          {canClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-dark-muted hover:text-dark-text hover:bg-dark-accent transition-colors
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-dark-surface"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Start sections"
          className="flex-shrink-0 flex gap-1 px-6 pb-4"
        >
          <button
            ref={tabCreateRef}
            role="tab"
            id="tab-create"
            aria-selected={activeTab === "create"}
            aria-controls="panel-create"
            tabIndex={activeTab === "create" ? 0 : -1}
            onClick={() => setActiveTab("create")}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                setActiveTab("recent");
                tabRecentRef.current?.focus();
              }
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-dark-surface
              ${activeTab === "create" ? "bg-dark-accent text-dark-text" : "text-dark-muted hover:text-dark-text"}`}
          >
            Create Project
          </button>
          <button
            ref={tabRecentRef}
            role="tab"
            id="tab-recent"
            aria-selected={activeTab === "recent"}
            aria-controls="panel-recent"
            tabIndex={activeTab === "recent" ? 0 : -1}
            onClick={() => setActiveTab("recent")}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                setActiveTab("create");
                tabCreateRef.current?.focus();
              }
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-dark-surface
              ${activeTab === "recent" ? "bg-dark-accent text-dark-text" : "text-dark-muted hover:text-dark-text"}`}
          >
            Recent Projects
          </button>
          {isTauri() && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleOpenProjectFile()}
              disabled={openingProject}
              className="ml-2"
            >
              {openingProject ? "Opening…" : "Open Project"}
            </Button>
          )}
        </div>
        {openProjectError && (
          <p className="px-6 pb-2 text-xs text-red-400" role="alert">
            {openProjectError}
          </p>
        )}

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
          {/* Create Project tab panel */}
          <div
            role="tabpanel"
            id="panel-create"
            aria-labelledby="tab-create"
            hidden={activeTab !== "create"}
            className="space-y-6"
          >
            <ProjectScopeBox
              variant="multi"
              label="Select Modules"
              onCreate={handleCreateProject}
              inputRef={initialFocusRef}
              isExpanded={true}
            />
          </div>

          {/* Recent Projects tab panel */}
          <div
            role="tabpanel"
            id="panel-recent"
            aria-labelledby="tab-recent"
            hidden={activeTab !== "recent"}
            className="space-y-3"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs font-medium uppercase tracking-wide text-dark-muted">
                Recent Projects
              </span>
              <ModeSwitchNavbar
                slots={(
                  [
                    { id: "all", label: "All" },
                    { id: "single", label: "Single-module" },
                    { id: "multi", label: "Multi-module" },
                  ] as const
                ).map(({ id, label }) => ({
                  id,
                  label,
                  active: recentsFilter === id,
                  onClick: () => handleRecentsFilterChange(id),
                }))}
              />
            </div>

            {filteredRecentEntries.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-dark-muted text-sm">
                  {recentEntries.length === 0
                    ? "No recent projects yet."
                    : "No projects match this filter."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRecentEntries.map((entry) => {
                  if (entry.kind === "modular") {
                    return (
                      <div
                        key={`m-${entry.id}`}
                        className="flex items-center gap-3 px-4 py-4 rounded-xl bg-dark-bg/50 border border-dark-accent/50 hover:border-dark-accent/80 transition-colors group"
                      >
                        <div className="flex flex-wrap gap-1 flex-shrink-0 max-w-[120px]">
                          {entry.modules.map((mod) => (
                            <button
                              key={mod.subProjectId}
                              type="button"
                              title={mod.label}
                              aria-label={`Open ${mod.label}`}
                              onClick={() => handleOpenModule(mod.typeName, mod.subProjectId)}
                              className="w-9 h-9 flex items-center justify-center rounded-lg border border-dark-accent/50 text-lg transition-colors text-dark-muted hover:text-dark-text hover:bg-dark-accent/40 hover:border-dark-accent"
                            >
                              {mod.icon}
                            </button>
                          ))}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-dark-text font-medium truncate">{entry.name}</p>
                          <p className="text-dark-muted text-xs mt-0.5">
                            {formatLastOpened(entry.lastOpened)}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {entry.modules.map((mod) => (
                              <span
                                key={mod.subProjectId}
                                className="text-xs text-dark-muted bg-dark-surface px-2 py-0.5 rounded"
                              >
                                {mod.label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleOpenModular(entry)}
                            className="flex items-center gap-1.5"
                          >
                            Open
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({
                                id: entry.id,
                                name: entry.name,
                                source: "modular",
                                subProjectIds: entry.modules.map((m) => m.subProjectId),
                              });
                            }}
                            className="p-2 rounded-lg text-dark-muted hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-60 group-hover:opacity-100"
                            title="Delete project and all modules"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const registryItem = getRegistryItemForModuleKey(entry.moduleType);
                  const moduleLabel = MODULE_LABELS[entry.moduleType] ?? registryItem?.label ?? entry.moduleType;

                  return (
                    <div
                      key={`${entry.kind}-${entry.id}`}
                      className="flex items-center gap-3 px-4 py-4 rounded-xl bg-dark-bg/50 border border-dark-accent/50 hover:border-dark-accent/80 transition-colors group"
                    >
                      {registryItem ? (
                        <div
                          className="w-9 h-9 flex items-center justify-center rounded-lg border border-dark-accent/50 bg-dark-accent/30 text-lg flex-shrink-0"
                          title={registryItem.label}
                        >
                          {registryItem.icon}
                        </div>
                      ) : (
                        <ModuleIconPlaceholder />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-dark-text font-medium truncate">{entry.name}</p>
                        <p className="text-dark-muted text-xs mt-0.5">
                          {formatLastOpened(entry.lastOpened)}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className="text-xs text-dark-muted bg-dark-surface px-2 py-0.5 rounded">
                            {moduleLabel}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setIntroDialogOpen(false);
                            onClose();
                            openInNewWindow(getModuleRoute(entry.moduleType, entry.id));
                          }}
                          className="flex items-center gap-1.5"
                        >
                          Open
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({
                              id: entry.id,
                              name: entry.name,
                              source: entry.kind,
                            });
                          }}
                          className="p-2 rounded-lg text-dark-muted hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-60 group-hover:opacity-100"
                          title="Delete project"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
  );

  const modalFragment = deleteTarget ? (
    <Modal
      isOpen={!!deleteTarget}
      onClose={() => setDeleteTarget(null)}
      title="Delete project?"
    >
      <p className="text-dark-muted text-sm mb-4">
        Delete &quot;{deleteTarget?.name}&quot;? This cannot be undone.
      </p>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => setDeleteTarget(null)} className="flex-1">
          Cancel
        </Button>
        <Button variant="danger" onClick={handleConfirmDelete} className="flex-1">
          Delete
        </Button>
      </div>
    </Modal>
  ) : null;

  if (standalone) {
    return (
      <div className="min-h-screen bg-dark-surface" role="dialog" aria-modal="true" aria-labelledby="intro-dialog-title">
        {card}
        {modalFragment}
      </div>
    );
  }

  const overlayContent = (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"
      onClick={canClose ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-dialog-title"
    >
      {card}
      {modalFragment}
    </div>
  );

  return createPortal(overlayContent, document.body);
}
