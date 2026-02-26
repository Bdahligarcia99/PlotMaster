import { useState, useEffect } from "react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { useFamilyTreeStore } from "../../store/familyTreeStore";

export default function FamilyTreeSaveControls() {
  const {
    activeProjectId,
    hasUnsavedChanges,
    isSaving,
    lastSaveError,
    flushSaveAndSave,
    loadTree,
  } = useFamilyTreeStore();

  const [savedFeedbackUntil, setSavedFeedbackUntil] = useState(0);
  const [showReloadConfirm, setShowReloadConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (savedFeedbackUntil > 0) {
      const t = setTimeout(() => setSavedFeedbackUntil(0), Math.max(0, savedFeedbackUntil - Date.now()));
      return () => clearTimeout(t);
    }
  }, [savedFeedbackUntil]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const showSavedCheck = savedFeedbackUntil > Date.now();

  const handleSave = async () => {
    const ok = await flushSaveAndSave();
    if (ok) {
      setSavedFeedbackUntil(Date.now() + 1200);
    }
  };

  const handleReloadClick = () => {
    if (hasUnsavedChanges) {
      setShowReloadConfirm(true);
    } else {
      doReload();
    }
  };

  const doReload = async () => {
    setShowReloadConfirm(false);
    if (!activeProjectId) return;
    const { hadData } = await loadTree(activeProjectId);
    if (!hadData) {
      setMessage("Nothing saved yet.");
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className={`text-xs min-w-[7rem] text-right ${lastSaveError ? "text-red-400" : "text-dark-muted"}`}
          aria-live="polite"
        >
          {activeProjectId && (isSaving || lastSaveError || hasUnsavedChanges)
            ? isSaving
              ? "Saving…"
              : lastSaveError
                ? "Save failed"
                : "Unsaved changes"
            : "\u00A0"}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!activeProjectId || isSaving}
          title={activeProjectId ? "Save tree (flush debounce)" : "No project loaded"}
        >
          {showSavedCheck ? "Saved ✓" : isSaving ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleReloadClick}
          disabled={!activeProjectId}
          title={activeProjectId ? "Reload last saved version (discard unsaved changes)" : "No project loaded"}
        >
          Reload
        </Button>
        {message && <span className="text-amber-400 text-xs">{message}</span>}
      </div>

      <Modal
        isOpen={showReloadConfirm}
        onClose={() => setShowReloadConfirm(false)}
        title="Reload?"
      >
        <p className="text-dark-muted text-sm mb-4">
          Reload will discard unsaved changes. Continue?
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setShowReloadConfirm(false)} className="flex-1">
            Cancel
          </Button>
          <Button variant="primary" onClick={doReload} className="flex-1">
            Continue
          </Button>
        </div>
      </Modal>
    </>
  );
}
