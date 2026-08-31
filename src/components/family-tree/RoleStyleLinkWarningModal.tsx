import Modal from "../ui/Modal";
import type { RoleLinkCulprit } from "../../store/familyTreeStore";

interface RoleStyleLinkWarningModalProps {
  isOpen: boolean;
  roleLabel: string;
  culprits: RoleLinkCulprit[];
  onCancel: () => void;
  onProceed: () => void;
}

export default function RoleStyleLinkWarningModal({
  isOpen,
  roleLabel,
  culprits,
  onCancel,
  onProceed,
}: RoleStyleLinkWarningModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Replace connection styles?">
      <p className="text-dark-text mb-3 text-sm">
        Enabling the parent/child role style for <strong>{roleLabel}</strong> will replace
        currently assigned styles for the connections below. Your previous assignments are kept
        and will return if you unlink this role.
      </p>
      <div className="max-h-48 overflow-y-auto nowheel mb-4 border border-dark-accent rounded-lg divide-y divide-dark-accent">
        {culprits.map((c) => (
          <div key={`${c.unionId}:${c.personId}`} className="px-3 py-2 text-xs">
            <div className="text-dark-text font-medium truncate">{c.personName}</div>
            <div className="text-dark-muted truncate">
              {c.unionName} · current: {c.currentStyleName}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 justify-end flex-wrap">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded border border-dark-accent/50 hover:bg-dark-accent/30 text-dark-text"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onProceed}
          className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white"
        >
          Proceed
        </button>
      </div>
    </Modal>
  );
}
