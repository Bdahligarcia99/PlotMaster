import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import ProjectSaveControls from "../ui/ProjectSaveControls";
import {
  getExportGuideScaleSteps,
  snapExportGuideScale,
} from "./ExportGuidesOverlay";
import { useFamilyTreeStore } from "../../store/familyTreeStore";

export default function FamilyTreeSaveControls() {
  const {
    activeProjectId,
    hasUnsavedChanges,
    isSaving,
    lastSaveError,
    flushSaveAndSave,
    setShowExportDialog,
    exportGuidesVisible,
    setExportGuidesVisible,
    exportGuideScale,
    setExportGuideScale,
  } = useFamilyTreeStore();

  const [savedFeedbackUntil, setSavedFeedbackUntil] = useState(0);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const exportContainerRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (savedFeedbackUntil > 0) {
      const t = setTimeout(() => setSavedFeedbackUntil(0), Math.max(0, savedFeedbackUntil - Date.now()));
      return () => clearTimeout(t);
    }
  }, [savedFeedbackUntil]);

  useEffect(() => {
    if (!exportDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = exportContainerRef.current?.contains(target);
      const inDropdown = exportDropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) setExportDropdownOpen(false);
    };
    const t = setTimeout(
      () => document.addEventListener("click", handleClickOutside, { once: true }),
      0
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [exportDropdownOpen]);

  const showSavedCheck = savedFeedbackUntil > Date.now();

  const handleSave = async () => {
    const ok = await flushSaveAndSave();
    if (ok) {
      setSavedFeedbackUntil(Date.now() + 1200);
    }
  };

  const status =
    activeProjectId && (isSaving || lastSaveError || hasUnsavedChanges)
      ? {
          text: isSaving ? "Saving…" : lastSaveError ? "Save failed" : "Unsaved changes",
          isError: !!lastSaveError,
        }
      : null;

  const exportSlot = (
    <div ref={exportContainerRef} className="relative flex rounded-lg border border-dark-accent/50">
      <button
        type="button"
        onClick={() => setShowExportDialog(true)}
        title="Export tree to PDF"
        className="px-3 py-1.5 rounded-none border-0 rounded-l-lg bg-dark-accent hover:bg-dark-bg text-dark-text text-sm font-medium"
      >
        Export
      </button>
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setExportDropdownOpen((o) => !o);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="px-1.5 rounded-r-lg border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-bg text-dark-text text-sm flex items-center justify-center"
        title="Export options"
        aria-expanded={exportDropdownOpen}
        aria-haspopup="true"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {exportDropdownOpen &&
        createPortal(
          <div
            ref={exportDropdownRef}
            className="fixed py-1 min-w-[180px] rounded-lg border border-dark-accent bg-dark-surface shadow-lg z-[9999]"
            style={{
              top: exportContainerRef.current
                ? exportContainerRef.current.getBoundingClientRect().bottom + 4
                : 0,
              left: exportContainerRef.current
                ? exportContainerRef.current.getBoundingClientRect().left
                : 0,
            }}
          >
            <label className="flex items-center gap-2 px-3 py-2 text-sm text-dark-text cursor-pointer hover:bg-dark-accent/50">
              <input
                type="checkbox"
                checked={exportGuidesVisible}
                onChange={(e) => setExportGuidesVisible(e.target.checked)}
                className="rounded border-dark-accent bg-dark-bg text-blue-500 focus:ring-blue-500/50"
              />
              <span>Show export guides</span>
            </label>
            {exportGuidesVisible && (
              <>
                <hr className="my-1 border-dark-accent/50" />
                <div className="flex items-center gap-1 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      const steps = getExportGuideScaleSteps();
                      const i = steps.findIndex((s) => s >= exportGuideScale);
                      const prev = i <= 0 ? steps[0] : steps[i - 1];
                      setExportGuideScale(prev);
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/50 text-sm font-medium"
                    title="Decrease grid size"
                  >
                    −
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={getExportGuideScaleSteps().length - 1}
                    step={1}
                    value={getExportGuideScaleSteps().findIndex((s) => s >= snapExportGuideScale(exportGuideScale))}
                    onChange={(e) => {
                      const steps = getExportGuideScaleSteps();
                      const idx = Math.round(parseFloat(e.target.value));
                      setExportGuideScale(steps[Math.min(idx, steps.length - 1)]);
                    }}
                    className="w-16 h-1.5 accent-blue-500"
                    title="Guide scale"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const steps = getExportGuideScaleSteps();
                      const i = steps.findIndex((s) => s > exportGuideScale);
                      const next = i < 0 ? steps[steps.length - 1] : steps[i];
                      setExportGuideScale(next);
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/50 text-sm font-medium"
                    title="Increase grid size"
                  >
                    +
                  </button>
                  <span className="text-dark-muted text-xs min-w-[2.5rem]">
                    {exportGuideScale <= 1
                      ? `${Math.round(exportGuideScale * 100)}%`
                      : (() => {
                          const n = 2 * Math.round(exportGuideScale) - 1;
                          return `${n}×${n}`;
                        })()}
                  </span>
                </div>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );

  return (
    <ProjectSaveControls
      activeProjectId={activeProjectId}
      status={status}
      isSaving={isSaving}
      showSavedCheck={showSavedCheck}
      onSave={handleSave}
      exportSlot={exportSlot}
      saveAsFileProjectName="Family Tree"
    />
  );
}
