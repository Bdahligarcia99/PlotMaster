import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import TopBar from "../components/ui/TopBar";
import { useAppStore } from "../store/appStore";
import FamilyTreeCanvas from "../components/family-tree/FamilyTreeCanvas";
import FamilyTreeToolbar from "../components/family-tree/FamilyTreeToolbar";
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
import ProfilesEntitiesPanel from "../components/profiles/ProfilesEntitiesPanel";
import ProfilesCanvasPlaceholder from "../components/profiles/ProfilesCanvasPlaceholder";
import ProfilesScriptPane from "../components/profiles/ProfilesScriptPane";
import ProfilesInspector from "../components/profiles/ProfilesInspector";

export default function WorkspaceShell() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [scriptPaneOpen, setScriptPaneOpen] = useState(true);

  const workspaces = useAppStore((s) => s.workspaces);
  const projects = useAppStore((s) => s.projects);

  const workspace = workspaces.find((w) => w.id === id);
  const attachedProject = workspace?.attachedProjectId
    ? projects.find((p) => p.id === workspace.attachedProjectId)
    : null;

  const isFamilyTree = workspace?.moduleType === "Family Tree";
  const isTimeline = workspace?.moduleType === "Timeline";
  const isIdeas = workspace?.moduleType === "Ideas";
  const isProfiles = workspace?.moduleType === "Profiles";
  const hasPanelLayout = isFamilyTree || isTimeline || isIdeas || isProfiles;

  if (!workspace) {
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
              onClick={() => navigate("/")}
              className="flex items-center gap-2 px-3 py-1.5 text-dark-muted hover:text-dark-text transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Home
            </button>
            <div className="h-4 w-px bg-dark-accent" />
            <span className="text-dark-text font-medium truncate max-w-[200px]">Project: {workspace.name}</span>
            <span className="text-xs text-dark-muted bg-dark-accent px-2 py-0.5 rounded">
              {workspace.moduleType}
            </span>
            {attachedProject && (
              <span className="text-xs text-blue-400/80">
                → Modular Project: {attachedProject.name}
              </span>
            )}
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            {hasPanelLayout && (
              <>
                <button
                  onClick={() => setLeftSidebarOpen((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    leftSidebarOpen
                      ? "bg-dark-accent border-dark-accent text-dark-text"
                      : "border-dark-accent text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
                  }`}
                  title={leftSidebarOpen ? "Hide Entities" : "Show Entities"}
                >
                  Entities
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
                <FamilyTreeLeftSidebar />
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
                <FamilyTreeCanvas />
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
          <div className="flex-1 flex min-h-0">
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
                title="Show Entities"
              >
                <span className="text-xs font-medium transform -rotate-90 whitespace-nowrap origin-center">
                  Entities
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
        ) : isProfiles ? (
          <div className="flex-1 flex min-h-0">
            <div
              className="flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out flex"
              style={{ width: leftSidebarOpen ? 260 : 0 }}
            >
              <ProfilesEntitiesPanel />
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
              <ProfilesCanvasPlaceholder />
              <div
                className="flex-shrink-0 overflow-hidden transition-[height] duration-200 ease-in-out"
                style={{ height: scriptPaneOpen ? 240 : 0 }}
              >
                <ProfilesScriptPane />
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
            {inspectorOpen && <ProfilesInspector />}
          </div>
        ) : (
          <>
            <div className="flex-1 flex min-h-0">
              <div className="flex-1 m-4 rounded-xl border-2 border-dashed border-dark-accent/50 flex items-center justify-center bg-dark-surface/30">
                <div className="text-center text-dark-muted">
                  <p className="text-sm font-medium">{workspace.moduleType} Canvas</p>
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
