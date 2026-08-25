import { useState, useEffect } from "react";
import ProjectSaveControls from "../ui/ProjectSaveControls";
import { useNeuronStore } from "../../store/neuronStore";

export default function NeuronSaveControls() {
  const {
    activeProjectId,
    hasUnsavedChanges,
    isSaving,
    lastSaveError,
    saveProject,
  } = useNeuronStore();

  const [savedFeedbackUntil, setSavedFeedbackUntil] = useState(0);

  useEffect(() => {
    if (savedFeedbackUntil > 0) {
      const t = setTimeout(
        () => setSavedFeedbackUntil(0),
        Math.max(0, savedFeedbackUntil - Date.now())
      );
      return () => clearTimeout(t);
    }
  }, [savedFeedbackUntil]);

  const showSavedCheck = savedFeedbackUntil > Date.now();

  const handleSave = async () => {
    const flush = (window as unknown as { __neuronFlushEditor?: () => void }).__neuronFlushEditor;
    flush?.();
    const ok = await saveProject();
    if (ok) setSavedFeedbackUntil(Date.now() + 1200);
  };

  const status =
    activeProjectId && (isSaving || lastSaveError || hasUnsavedChanges)
      ? {
          text: isSaving ? "Saving…" : lastSaveError ? "Save failed" : "Unsaved changes",
          isError: !!lastSaveError,
        }
      : null;

  return (
    <ProjectSaveControls
      activeProjectId={activeProjectId}
      status={status}
      isSaving={isSaving}
      showSavedCheck={showSavedCheck}
      onSave={handleSave}
      saveAsFileProjectName="Neuron"
      hideSaveButton
    />
  );
}
