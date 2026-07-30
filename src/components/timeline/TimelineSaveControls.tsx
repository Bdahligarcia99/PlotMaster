import { useState, useEffect } from "react";
import ProjectSaveControls from "../ui/ProjectSaveControls";
import { useTimelineStore } from "../../store/timelineStore";

interface TimelineSaveControlsProps {
  hasDraftChanges?: boolean;
  onCommitDrafts?: () => { ok: boolean };
  commitError?: string | null;
}

export default function TimelineSaveControls({
  hasDraftChanges = false,
  onCommitDrafts,
  commitError = null,
}: TimelineSaveControlsProps) {
  const {
    activeProjectId,
    hasUnsavedChanges,
    isSaving,
    lastSaveError,
    flushSaveAndSave,
  } = useTimelineStore();

  const [savedFeedbackUntil, setSavedFeedbackUntil] = useState(0);

  const hasAnyUnsaved = hasUnsavedChanges || hasDraftChanges;
  const statusError = lastSaveError ?? commitError;

  useEffect(() => {
    if (savedFeedbackUntil > 0) {
      const t = setTimeout(() => setSavedFeedbackUntil(0), Math.max(0, savedFeedbackUntil - Date.now()));
      return () => clearTimeout(t);
    }
  }, [savedFeedbackUntil]);

  const showSavedCheck = savedFeedbackUntil > Date.now();

  const handleSave = async () => {
    if (onCommitDrafts) {
      const commitOk = onCommitDrafts();
      if (!commitOk.ok) return;
    }
    const ok = await flushSaveAndSave();
    if (ok) {
      setSavedFeedbackUntil(Date.now() + 1200);
    }
  };

  const status =
    activeProjectId && (isSaving || statusError || hasAnyUnsaved)
      ? {
          text: isSaving ? "Saving…" : statusError ? "Save failed" : "Unsaved changes",
          isError: !!statusError,
        }
      : null;

  return (
    <ProjectSaveControls
      activeProjectId={activeProjectId}
      status={status}
      isSaving={isSaving}
      showSavedCheck={showSavedCheck}
      onSave={handleSave}
      saveAsFileProjectName="Timeline Outliner"
    />
  );
}
