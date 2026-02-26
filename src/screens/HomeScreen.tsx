import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import TopBar from "../components/ui/TopBar";
import Modal from "../components/ui/Modal";
import NewStandaloneProjectModal from "../components/NewStandaloneProjectModal";
import { useAppStore } from "../store/appStore";
import { getStorageDriver } from "../storage/StorageDriver";
import type { ProjectIndexItem } from "../storage/StorageDriver";
import { APP_VERSION } from "../version";

type DeleteTarget = { id: string; name: string; source: "driver" | "standalone" };

const generateId = () => `_${Math.random().toString(36).slice(2, 11)}`;

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
  timeline: "Timeline",
  Timeline: "Timeline",
  characterProfiles: "Character Profiles",
  Profiles: "Character Profiles",
  ideas: "Ideas",
  Ideas: "Ideas",
};

export default function HomeScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectModuleType, setNewProjectModuleType] = useState<string>("Timeline");
  const [allProjects, setAllProjects] = useState<ProjectIndexItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const standaloneProjects = useAppStore((s) => s.standaloneProjects);
  const removeStandaloneProject = useAppStore((s) => s.removeStandaloneProject);

  useEffect(() => {
    getStorageDriver()
      .listProjects()
      .then((list) => setAllProjects(list));
  }, []);

  const refreshProjects = () => {
    getStorageDriver()
      .listProjects()
      .then((list) => setAllProjects(list));
  };

  const handleNavigateToProject = (p: ProjectIndexItem | { id: string; moduleType: string; name: string; lastOpened: number }) => {
    if (p.moduleType === "familyTree") {
      navigate(`/family-tree/${p.id}`);
    } else {
      navigate(`/project/${p.id}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const { id, source } = deleteTarget;
    setDeleteTarget(null);
    if (source === "driver") {
      await getStorageDriver().deleteProject(id);
      refreshProjects();
    } else {
      removeStandaloneProject(id);
      await getStorageDriver().deleteProject(id);
    }
    if (location.pathname === `/project/${id}` || location.pathname === `/family-tree/${id}`) {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col">
      <TopBar
        right={
          <>
            <button
              className="p-2 rounded-lg text-dark-muted hover:text-dark-text hover:bg-dark-accent transition-colors"
              title="Search"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button
              className="p-2 rounded-lg text-dark-muted hover:text-dark-text hover:bg-dark-accent transition-colors"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center p-6">
          <div className="w-full max-w-3xl space-y-8">
            {/* Hero */}
            <div className="text-center py-6">
              <div className="flex items-center justify-center gap-2">
                <h1 className="text-3xl font-bold text-dark-text">PlotMaster</h1>
                <span className="text-xs text-dark-muted bg-dark-surface px-2 py-0.5 rounded-full">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-dark-muted text-sm mt-2">
                Engineer your story. Think in graphs.
              </p>
              <div className="flex gap-3 justify-center mt-6 flex-wrap">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={async () => {
                    const id = generateId();
                    const driver = getStorageDriver();
                    const existing = await driver.listProjects();
                    const num = existing.filter((p) => p.moduleType === "familyTree").length + 1;
                    await driver.createProject({
                      id,
                      name: `Family Tree ${num}`,
                      moduleType: "familyTree",
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    });
                    refreshProjects();
                    navigate(`/family-tree/${id}`);
                  }}
                  className="flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Family Tree Project
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => { setNewProjectModuleType("Timeline"); setShowNewProjectModal(true); }}
                  className="flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  </svg>
                  New Timeline Project
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => { setNewProjectModuleType("Profiles"); setShowNewProjectModal(true); }}
                  className="flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  New Character Profiles Project
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => { setNewProjectModuleType("Ideas"); setShowNewProjectModal(true); }}
                  className="flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  New Ideas Project
                </Button>
              </div>
            </div>

            {/* Recent Projects */}
            <Card padding="lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
                  Recent Projects
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const id = generateId();
                    const driver = getStorageDriver();
                    const existing = await driver.listProjects();
                    const num = existing.filter((p) => p.moduleType === "familyTree").length + 1;
                    await driver.createProject({
                      id,
                      name: `Family Tree ${num}`,
                      moduleType: "familyTree",
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    });
                    refreshProjects();
                    navigate(`/family-tree/${id}`);
                  }}
                  className="flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Family Tree Project
                </Button>
              </div>
              {allProjects.length === 0 && standaloneProjects.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-dark-muted text-sm">No projects yet.</p>
                  <p className="text-dark-muted text-xs mt-1">Create one to get started.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {allProjects.map((p) => (
                    <div
                      key={`d-${p.id}`}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-accent/50 transition-colors group"
                    >
                      <button
                        onClick={() => handleNavigateToProject(p)}
                        className="flex-1 flex items-center gap-3 min-w-0 text-left"
                      >
                        <ModuleIconPlaceholder />
                        <div className="flex-1 min-w-0">
                          <p className="text-dark-text font-medium truncate">{p.name}</p>
                          <p className="text-dark-muted text-xs">{formatLastOpened(p.updatedAt)}</p>
                        </div>
                        <span className="text-xs text-dark-muted bg-dark-bg px-2 py-0.5 rounded">
                          {MODULE_LABELS[p.moduleType] ?? p.moduleType}
                        </span>
                        <svg className="w-5 h-5 text-dark-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: p.id, name: p.name, source: "driver" }); }}
                        className="p-2 rounded-lg text-dark-muted hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-60 group-hover:opacity-100"
                        title="Delete project"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {standaloneProjects.map((p) => (
                    <div
                      key={`s-${p.id}`}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-accent/50 transition-colors group"
                    >
                      <button
                        onClick={() => handleNavigateToProject(p)}
                        className="flex-1 flex items-center gap-3 min-w-0 text-left"
                      >
                        <ModuleIconPlaceholder />
                        <div className="flex-1 min-w-0">
                          <p className="text-dark-text font-medium truncate">{p.name}</p>
                          <p className="text-dark-muted text-xs">{formatLastOpened(p.lastOpened)}</p>
                        </div>
                        <span className="text-xs text-dark-muted bg-dark-bg px-2 py-0.5 rounded">
                          {MODULE_LABELS[p.moduleType] ?? p.moduleType}
                        </span>
                        <svg className="w-5 h-5 text-dark-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: p.id, name: p.name, source: "standalone" }); }}
                        className="p-2 rounded-lg text-dark-muted hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-60 group-hover:opacity-100"
                        title="Delete project"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <p className="text-dark-muted/70 text-xs text-center py-4">
              Modular Projects (multi-module containers) coming soon.
            </p>
          </div>
        </div>
      </div>

      <NewStandaloneProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        defaultModuleType={newProjectModuleType}
      />

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete project?"
      >
        <p className="text-dark-muted text-sm mb-4">
          Delete "{deleteTarget?.name}"? This cannot be undone.
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
    </div>
  );
}
