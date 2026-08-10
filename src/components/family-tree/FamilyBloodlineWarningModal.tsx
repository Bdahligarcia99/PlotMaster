import Modal from "../ui/Modal";

interface FamilyBloodlineWarningModalProps {
  isOpen: boolean;
  familyName: string;
  onResolve: (choice: "deleteDescendants" | "keep") => void;
  onClose: () => void;
}

export default function FamilyBloodlineWarningModal({
  isOpen,
  familyName,
  onResolve,
  onClose,
}: FamilyBloodlineWarningModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bloodline warning">
      <p className="text-dark-text mb-4">
        Deleting this connection may cause issues. Would you like to delete all descendants?
        {familyName ? (
          <span className="block mt-2 text-sm text-dark-muted">
            Affected family: {familyName}
          </span>
        ) : null}
      </p>
      <div className="flex gap-2 justify-end flex-wrap">
        <button
          type="button"
          onClick={() => onResolve("keep")}
          className="px-3 py-1.5 text-sm rounded border border-dark-accent/50 hover:bg-dark-accent/30 text-dark-text"
        >
          No
        </button>
        <button
          type="button"
          onClick={() => onResolve("deleteDescendants")}
          className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-700 text-white"
        >
          Yes, delete descendants
        </button>
      </div>
    </Modal>
  );
}
