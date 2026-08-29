import Modal from "../ui/Modal";

interface FamilyEradicationWarningModalProps {
  isOpen: boolean;
  familyName: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function FamilyEradicationWarningModal({
  isOpen,
  familyName,
  onConfirm,
  onClose,
}: FamilyEradicationWarningModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Eradication Warning">
      <p className="text-dark-text mb-4">
        This will erase all {familyName || "this family"}&apos;s union and person nodes. Proceed?
      </p>
      <div className="flex gap-2 justify-end flex-wrap">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm rounded border border-dark-accent/50 hover:bg-dark-accent/30 text-dark-text"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-700 text-white"
        >
          Confirm
        </button>
      </div>
    </Modal>
  );
}
