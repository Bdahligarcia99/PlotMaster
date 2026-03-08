import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";

const ENTITIES_MIN_W = 220;
const ENTITIES_MAX_W = 520;
const SCRIPT_MIN_H = 160;
const SCRIPT_MAX_H = 520;
import Button from "../components/ui/Button";
import TopBar from "../components/ui/TopBar";
import { useWindowTitle } from "../hooks/useWindowTitle";
import FamilyTreeCanvas from "../components/family-tree/FamilyTreeCanvas";
import FamilyTreeToolbar from "../components/family-tree/FamilyTreeToolbar";
import FamilyTreeSaveControls from "../components/family-tree/FamilyTreeSaveControls";
import FamilyTreeLeftSidebar from "../components/family-tree/FamilyTreeLeftSidebar";
import FamilyTreeScriptPane from "../components/family-tree/FamilyTreeScriptPane";
import FamilyTreeInspector from "../components/family-tree/FamilyTreeInspector";
import { useFamilyTreeStore } from "../store/familyTreeStore";
import { useAppStore } from "../store/appStore";
import { isTauri, openOrFocusIntroWindow } from "../tauri/openProjectInNewWindow";
import { getStorageDriver } from "../storage/StorageDriver";

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

  const loadTree = useFamilyTreeStore((s) => s.loadTree);
  const marqueeToolActive = useFamilyTreeStore((s) => s.marqueeToolActive);
  const setIntroDialogOpen = useAppStore((s) => s.setIntroDialogOpen);
  const isSpacePanning = useFamilyTreeStore((s) => s.isSpacePanning);

  useWindowTitle(projectName ? `${projectName} - PlotMaster` : "PlotMaster");

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
            <span className="text-xs text-dark-muted bg-dark-accent px-2 py-0.5 rounded">
              Family Tree
            </span>
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <FamilyTreeSaveControls />
            <div className="h-4 w-px bg-dark-accent" />
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
        <FamilyTreeToolbar />
        <div className="flex-1 flex min-h-0">
          {leftSidebarOpen && (
            <>
              <div
                className="flex-shrink-0 overflow-hidden flex"
                style={{ width: entitiesWidth }}
              >
                <FamilyTreeLeftSidebar onSelectNode={() => setInspectorOpen(true)} />
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
              title="Show Entities"
            >
              <span className="text-xs font-medium transform -rotate-90 whitespace-nowrap origin-center">
                Entities
              </span>
            </button>
          )}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <FamilyTreeCanvas
              panOnDrag={!isResizingEntities && (!marqueeToolActive || isSpacePanning)}
              nodesDraggable={!isResizingEntities && (!marqueeToolActive || isSpacePanning)}
              marqueeToolActive={marqueeToolActive}
              isSpacePanning={isSpacePanning}
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
                  <FamilyTreeScriptPane />
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
          </div>
          {inspectorOpen && <FamilyTreeInspector />}
        </div>
      </div>
    </div>
  );
}
