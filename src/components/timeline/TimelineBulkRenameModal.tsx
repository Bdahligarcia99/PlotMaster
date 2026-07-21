import { useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { useTimelineStore } from "../../store/timelineStore";

interface TimelineBulkRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  beatIds: string[];
}

export default function TimelineBulkRenameModal({
  isOpen,
  onClose,
  beatIds,
}: TimelineBulkRenameModalProps) {
  const bulkRenameBeatTitles = useTimelineStore((s) => s.bulkRenameBeatTitles);
  const [baseLabel, setBaseLabel] = useState("Beat");

  const handleConfirm = () => {
    if (beatIds.length === 0) return;
    bulkRenameBeatTitles(beatIds, baseLabel);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Rename beat titles">
      <p className="text-sm text-dark-muted mb-3">
        Renames {beatIds.length} beat{beatIds.length === 1 ? "" : "s"} sequentially in slot order.
        Description and date fields are not changed.
      </p>
      <label className="block space-y-1 mb-4">
        <span className="text-xs text-dark-muted">Base label</span>
        <input
          type="text"
          value={baseLabel}
          onChange={(e) => setBaseLabel(e.target.value)}
          className="w-full px-3 py-2 rounded bg-dark-bg border border-dark-accent text-sm"
          placeholder="Beat"
        />
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleConfirm} disabled={beatIds.length === 0}>
          Rename
        </Button>
      </div>
    </Modal>
  );
}
