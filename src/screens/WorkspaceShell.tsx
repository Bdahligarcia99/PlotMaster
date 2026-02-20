import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import TopBar from "../components/ui/TopBar";
import { useAppStore } from "../store/appStore";

export default function WorkspaceShell() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const workspaces = useAppStore((s) => s.workspaces);
  const projects = useAppStore((s) => s.projects);

  const workspace = workspaces.find((w) => w.id === id);
  const attachedProject = workspace?.attachedProjectId
    ? projects.find((p) => p.id === workspace.attachedProjectId)
    : null;

  if (!workspace) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-dark-muted mb-4">Workspace not found</p>
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
              onClick={() => navigate("/")}
              className="flex items-center gap-2 px-3 py-1.5 text-dark-muted hover:text-dark-text transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Home
            </button>
            <div className="h-4 w-px bg-dark-accent" />
            <span className="text-dark-text font-medium truncate max-w-[200px]">{workspace.name}</span>
            <span className="text-xs text-dark-muted bg-dark-accent px-2 py-0.5 rounded">
              {workspace.moduleType}
            </span>
            {attachedProject && (
              <span className="text-xs text-blue-400/80">
                → {attachedProject.name}
              </span>
            )}
          </div>
        }
        right={
          <button
            onClick={() => setInspectorOpen(!inspectorOpen)}
            className={`p-2 rounded-lg transition-colors ${
              inspectorOpen ? "bg-dark-accent text-dark-text" : "text-dark-muted hover:text-dark-text hover:bg-dark-accent"
            }`}
            title="Inspector"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        }
      />

      <div className="flex-1 flex min-h-0">
        {/* Canvas area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 m-4 rounded-xl border-2 border-dashed border-dark-accent/50 flex items-center justify-center bg-dark-surface/30">
            <div className="text-center text-dark-muted">
              <p className="text-sm font-medium">{workspace.moduleType} Canvas</p>
              <p className="text-xs mt-1">Placeholder — Phase 2</p>
            </div>
          </div>
        </div>

        {/* Inspector panel (collapsed by default) */}
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
    </div>
  );
}
