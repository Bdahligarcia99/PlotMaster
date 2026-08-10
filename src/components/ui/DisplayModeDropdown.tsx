import { useEffect, useRef, useState } from "react";
import {
  DISPLAY_MODE_LABELS,
  DISPLAY_MODE_ORDER,
  type DisplayMode,
} from "../../home/displayModes";

interface DisplayModeDropdownProps {
  activeMode: DisplayMode | undefined;
  supportedModes: DisplayMode[];
  onSelect: (mode: DisplayMode) => void;
}

export default function DisplayModeDropdown({
  activeMode,
  supportedModes,
  onSelect,
}: DisplayModeDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasSupport = supportedModes.length > 0;
  const activeLabel =
    activeMode != null ? DISPLAY_MODE_LABELS[activeMode] : "None";

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = containerRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inContainer && !inMenu) setOpen(false);
    };
    const t = setTimeout(
      () => document.addEventListener("click", handleClickOutside, { once: true }),
      0
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => hasSupport && setOpen((o) => !o)}
        disabled={!hasSupport}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={
          hasSupport
            ? "Switch display mode"
            : "No display modes available for this module yet"
        }
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          hasSupport
            ? "border-dark-accent text-dark-text hover:bg-dark-accent/40 cursor-pointer"
            : "border-dark-accent/50 text-dark-muted/50 cursor-not-allowed bg-dark-surface/50"
        }`}
      >
        <span className="text-dark-muted">Display Mode:</span>
        <span>{activeLabel}</span>
        <svg
          className={`w-3.5 h-3.5 text-dark-muted ${hasSupport ? "" : "opacity-50"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && hasSupport && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Display mode"
          className="absolute left-0 top-full mt-1 z-50 min-w-[140px] py-1 rounded-lg border border-dark-accent bg-dark-surface shadow-lg"
        >
          {DISPLAY_MODE_ORDER.map((mode) => {
            const supported = supportedModes.includes(mode);
            const isActive = activeMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="option"
                aria-selected={isActive}
                disabled={!supported}
                onClick={() => {
                  if (!supported) return;
                  onSelect(mode);
                  setOpen(false);
                }}
                title={supported ? undefined : "Not available for this module"}
                className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors ${
                  !supported
                    ? "text-dark-muted/50 cursor-not-allowed bg-dark-surface/50"
                    : isActive
                      ? "bg-dark-accent text-dark-text"
                      : "text-dark-muted hover:text-dark-text hover:bg-dark-accent/40"
                }`}
              >
                {DISPLAY_MODE_LABELS[mode]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
