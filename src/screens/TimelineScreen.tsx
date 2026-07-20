import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import TopBar from "../components/ui/TopBar";
import { useWindowTitle } from "../hooks/useWindowTitle";
import TimelineEntitiesPanel from "../components/timeline/TimelineEntitiesPanel";
import TimelineBoard from "../components/timeline/TimelineBoard";
import TimelineToolbar from "../components/timeline/TimelineToolbar";
import TimelineScriptPane from "../components/timeline/TimelineScriptPane";
import TimelineInspector from "../components/timeline/TimelineInspector";
import TimelineSaveControls from "../components/timeline/TimelineSaveControls";
import { useTimelineStore } from "../store/timelineStore";
import { useAppStore } from "../store/appStore";
import { isTauri, openOrFocusIntroWindow } from "../tauri/openProjectInNewWindow";
import { getStorageDriver } from "../storage/StorageDriver";

const ENTITIES_MIN_W = 220;
const ENTITIES_MAX_W = 520;
const SCRIPT_MIN_H = 160;
const SCRIPT_MAX_H = 520;

export default function TimelineScreen() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [scriptPaneOpen, setScriptPaneOpen] = useState(true);
  const [entitiesWidth, setEntitiesWidth] = useState(260);
  const [scriptHeight, setScriptHeight] = useState(240);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");

  const loadTimeline = useTimelineStore((s) => s.loadTimeline);
  const selection = useTimelineStore((s) => s.selection);
  const setIntroDialogOpen = useAppStore((s) => s.setIntroDialogOpen);

  useEffect(() => {
    if (selection.length === 0) setInspectorOpen(false);
  }, [selection]);

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

  const entitiesDragStart = useRef<number | null>(null);
  const entitiesStartWidth = useRef(260);
  const scriptDragStart = useRef<number | null>(null);
  const scriptStartHeight = useRef(240);

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
    };
    const handlePointerUp = () => {
      entitiesDragStart.current = null;
      scriptDragStart.current = null;
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

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
            <span className="text-xs text-dark-muted bg-dark-accent px-2 py-0.5 rounded">
              Timeline Outliner
            </span>
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <TimelineSaveControls />
            <div className="h-4 w-px bg-dark-accent" />
            <button
              onClick={() => setLeftSidebarOpen((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                leftSidebarOpen
                  ? "bg-dark-accent border-dark-accent text-dark-text"
                  : "border-dark-accent text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
              }`}
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
          </div>
        }
      />

      <div className="flex-1 flex min-h-0 flex-col">
        <TimelineToolbar />
        <div className="flex-1 flex min-h-0">
          {leftSidebarOpen && (
            <>
              <div className="flex-shrink-0 overflow-hidden flex" style={{ width: entitiesWidth }}>
                <TimelineEntitiesPanel onSelectForEdit={() => setInspectorOpen(true)} />
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
              title="Show Entities"
            >
              <span className="text-xs font-medium transform -rotate-90 whitespace-nowrap origin-center">
                Entities
              </span>
            </button>
          )}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <TimelineBoard onSelectForEdit={() => setInspectorOpen(true)} />
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
          </div>
          {inspectorOpen && <TimelineInspector />}
        </div>
      </div>
    </div>
  );
}
