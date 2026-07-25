export type ModeSwitchSlot = {
  id: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
};

interface ModeSwitchNavbarProps {
  slots: ModeSwitchSlot[];
}

export default function ModeSwitchNavbar({ slots }: ModeSwitchNavbarProps) {
  return (
    <div className="flex rounded-lg border border-dark-accent overflow-hidden">
      {slots.map((slot) => (
        <button
          key={slot.id}
          type="button"
          onClick={slot.disabled ? undefined : slot.onClick}
          disabled={slot.disabled}
          title={
            slot.title ??
            (slot.disabled ? "Coming soon — future global workspace" : undefined)
          }
          className={`px-3 py-1 text-xs font-medium transition-colors ${
            slot.disabled
              ? "text-dark-muted/50 cursor-not-allowed bg-dark-surface/50"
              : slot.active
                ? "bg-dark-accent text-dark-text"
                : "text-dark-muted hover:text-dark-text hover:bg-dark-accent/40"
          }`}
        >
          {slot.label}
        </button>
      ))}
    </div>
  );
}
