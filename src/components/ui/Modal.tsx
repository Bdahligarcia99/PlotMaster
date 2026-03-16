import { useEffect } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Optional class for the inner content box (e.g. max-w-3xl for wider modals). */
  contentClassName?: string;
}

export default function Modal({ isOpen, onClose, title, children, contentClassName }: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div
        className={`bg-dark-surface rounded-xl p-6 w-full mx-4 shadow-2xl border border-dark-accent/50 ${contentClassName ?? "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-dark-text mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
