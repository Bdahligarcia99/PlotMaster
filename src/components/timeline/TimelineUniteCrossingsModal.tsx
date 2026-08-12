import Modal from "../ui/Modal";
import Button from "../ui/Button";
import type { TimelineConnection } from "../../store/timelineTypes";

interface TimelineUniteCrossingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionA: TimelineConnection;
  connectionB: TimelineConnection;
  onChooseColor: (color: string) => void;
}

function colorLabel(color: string | undefined): string {
  const trimmed = color?.trim() ?? "";
  return trimmed || "default";
}

export default function TimelineUniteCrossingsModal({
  isOpen,
  onClose,
  connectionA,
  connectionB,
  onChooseColor,
}: TimelineUniteCrossingsModalProps) {
  const colorA = connectionA.color?.trim() ?? "";
  const colorB = connectionB.color?.trim() ?? "";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Unite crossings">
      <p className="text-sm text-dark-muted mb-4">
        These crossings use different colors. Choose which color the united crossing should keep.
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onChooseColor(colorA)}
          className="flex items-center gap-3 w-full px-3 py-2 rounded border border-dark-accent/50 hover:bg-dark-accent/30 text-left text-sm text-dark-text"
        >
          <span
            className="w-6 h-6 rounded border border-dark-accent/60 shrink-0"
            style={{ backgroundColor: colorA || "#64748b" }}
            aria-hidden
          />
          Keep Crossing A color ({colorLabel(colorA)})
        </button>
        <button
          type="button"
          onClick={() => onChooseColor(colorB)}
          className="flex items-center gap-3 w-full px-3 py-2 rounded border border-dark-accent/50 hover:bg-dark-accent/30 text-left text-sm text-dark-text"
        >
          <span
            className="w-6 h-6 rounded border border-dark-accent/60 shrink-0"
            style={{ backgroundColor: colorB || "#64748b" }}
            aria-hidden
          />
          Keep Crossing B color ({colorLabel(colorB)})
        </button>
      </div>
      <div className="flex justify-end mt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
