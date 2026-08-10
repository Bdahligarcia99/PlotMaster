import type { ReactNode } from "react";
import Button from "./Button";
import SaveAsSynprojButton from "../project/SaveAsSynprojButton";

export interface ProjectSaveControlsProps {
  activeProjectId: string | null;
  status: { text: string; isError: boolean } | null;
  isSaving: boolean;
  showSavedCheck: boolean;
  onSave?: () => void | Promise<void>;
  exportSlot?: ReactNode;
  saveAsFileProjectName?: string;
}

export default function ProjectSaveControls({
  activeProjectId,
  status,
  isSaving,
  showSavedCheck,
  onSave,
  exportSlot,
  saveAsFileProjectName,
}: ProjectSaveControlsProps) {
  const saveDisabled = !activeProjectId || isSaving || !onSave;
  const exportDisabled = !exportSlot;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-xs min-w-[7rem] text-right ${status?.isError ? "text-red-400" : "text-dark-muted"}`}
        aria-live="polite"
      >
        {status?.text ?? "\u00A0"}
      </span>
      {exportSlot ? (
        exportSlot
      ) : (
        <div
          className="relative flex rounded-lg border border-dark-accent/50 opacity-50 cursor-not-allowed"
          aria-disabled={exportDisabled}
        >
          <button
            type="button"
            disabled={exportDisabled}
            title="Not available for this module yet"
            className="px-3 py-1.5 rounded-none border-0 rounded-l-lg bg-dark-accent text-dark-text text-sm font-medium cursor-not-allowed"
          >
            Export
          </button>
          <button
            type="button"
            disabled={exportDisabled}
            title="Not available for this module yet"
            className="px-1.5 rounded-r-lg border-l border-dark-accent/50 bg-dark-accent text-dark-text text-sm flex items-center justify-center cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}
      <Button
        variant="primary"
        size="sm"
        onClick={() => void onSave?.()}
        disabled={saveDisabled}
        title={
          !onSave
            ? "Save is not available for this module yet"
            : activeProjectId
              ? "Save project"
              : "No project loaded"
        }
        className={!onSave ? "opacity-50 cursor-not-allowed" : undefined}
      >
        {showSavedCheck ? "Saved ✓" : isSaving ? "Saving…" : "Save"}
      </Button>
      <SaveAsSynprojButton
        projectId={activeProjectId}
        projectName={saveAsFileProjectName ?? "Project"}
      />
    </div>
  );
}
