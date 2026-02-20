import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import TopBar from "../components/ui/TopBar";
import NewWorkspaceModal from "../components/NewWorkspaceModal";
import NewProjectModal from "../components/NewProjectModal";
import { useAppStore } from "../store/appStore";
import { APP_VERSION } from "../version";

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

export default function HomeScreen() {
  const navigate = useNavigate();
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);

  const workspaces = useAppStore((s) => s.workspaces);
  const projects = useAppStore((s) => s.projects);

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
              <div className="flex gap-3 justify-center mt-6">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => setShowNewWorkspace(true)}
                  className="flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Workspace
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setShowNewProject(true)}
                  className="flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  New Project
                </Button>
              </div>
            </div>

            {/* Workspaces Card */}
            <Card padding="lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
                  Workspaces
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowNewWorkspace(true)}
                  className="flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Workspace
                </Button>
              </div>
              {workspaces.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-dark-muted text-sm">No workspaces yet.</p>
                  <p className="text-dark-muted text-xs mt-1">Create one to get started.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {workspaces.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => navigate(`/workspaces/${w.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                        hover:bg-dark-accent/50 transition-colors text-left"
                    >
                      <ModuleIconPlaceholder />
                      <div className="flex-1 min-w-0">
                        <p className="text-dark-text font-medium truncate">{w.name}</p>
                        <p className="text-dark-muted text-xs">{formatLastOpened(w.lastOpened)}</p>
                      </div>
                      <span className="text-xs text-dark-muted bg-dark-bg px-2 py-0.5 rounded">
                        {w.moduleType}
                      </span>
                      <svg className="w-5 h-5 text-dark-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Projects Card */}
            <Card padding="lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
                  Projects
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowNewProject(true)}
                  className="flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Project
                </Button>
              </div>
              {projects.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-dark-muted text-sm">No projects yet.</p>
                  <p className="text-dark-muted text-xs mt-1">Create one to get started.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                        hover:bg-dark-accent/50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-dark-text font-medium truncate">{p.name}</p>
                        <p className="text-dark-muted text-xs">{formatLastOpened(p.lastOpened)}</p>
                      </div>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {p.enabledModules.map((m) => (
                          <span key={m} className="text-xs text-dark-muted bg-dark-bg px-2 py-0.5 rounded">
                            {m}
                          </span>
                        ))}
                        {p.enabledModules.length === 0 && (
                          <span className="text-xs text-dark-muted italic">No modules</span>
                        )}
                      </div>
                      <svg className="w-5 h-5 text-dark-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      <NewWorkspaceModal isOpen={showNewWorkspace} onClose={() => setShowNewWorkspace(false)} />
      <NewProjectModal isOpen={showNewProject} onClose={() => setShowNewProject(false)} />
    </div>
  );
}
