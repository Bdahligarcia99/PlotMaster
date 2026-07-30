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
        <Button
          variant="secondary"
          size="sm"
          disabled={exportDisabled}
          title="Not available for this module yet"
          className="opacity-50 cursor-not-allowed"
        >
          Export
        </Button>
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
