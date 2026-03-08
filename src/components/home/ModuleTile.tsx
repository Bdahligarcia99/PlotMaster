import type { ModuleRegistryItem } from "../../home/moduleRegistry";
import { AVAILABLE_MODULES } from "../../home/moduleRegistry";
import ComingSoonTooltip from "./ComingSoonTooltip";

type ModuleTileVariant = "multi" | "quick";

type AvailableId = "familyTree" | "characters" | "timeline" | "ideaPlayground";

interface ModuleTileProps {
  module: ModuleRegistryItem;
  variant: ModuleTileVariant;
  /** Only used in multi variant - whether the module is selected */
  selected?: boolean;
  /** Only used in multi variant - whether to show checkbox */
  showCheckbox?: boolean;
  /** When true, tile is greyed out and not selectable (e.g. when another module is selected) */
  isGreyedOut?: boolean;
  onSelect?: () => void;
  /** Called when user clicks tile in Quick variant. Passes module id. */
  onOpen?: (moduleId: string) => void;
}

export default function ModuleTile({
  module,
  variant,
  selected = false,
  showCheckbox = false,
  isGreyedOut = false,
  onSelect,
  onOpen,
}: ModuleTileProps) {
  const isAvailable = AVAILABLE_MODULES.includes(module.id as AvailableId);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isAvailable || isGreyedOut) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (variant === "multi" && showCheckbox) {
        onSelect?.();
      } else if (variant === "quick") {
        onOpen?.(module.id);
      }
    }
  };

  if (!isAvailable) {
    return (
      <div
        className="flex flex-col items-center justify-center p-4 rounded-xl border border-dark-accent/40
          bg-dark-accent/20 opacity-60 cursor-not-allowed select-none
          min-h-[100px] min-w-[120px]"
        role="presentation"
      >
        <span className="text-2xl mb-2">{module.icon}</span>
        <span className="text-sm font-medium text-dark-muted">{module.label}</span>
        <span className="mt-1.5">
          <ComingSoonTooltip />
        </span>
      </div>
    );
  }

  const greyedOutStyles = isGreyedOut
    ? "opacity-50 cursor-not-allowed border-dark-accent/40 bg-dark-accent/20 hover:bg-dark-accent/20 hover:border-dark-accent/40"
    : "cursor-pointer border-dark-accent/50 bg-dark-surface hover:bg-dark-accent/50 hover:border-dark-accent";

  // Available tile - Quick variant
  if (variant === "quick") {
    return (
      <button
        type="button"
        onClick={isGreyedOut ? undefined : () => onOpen?.(module.id)}
        onKeyDown={handleKeyDown}
        disabled={isGreyedOut}
        className={`flex flex-col items-center justify-center p-4 rounded-xl transition-colors min-h-[100px] min-w-[120px]
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-dark-bg
          ${greyedOutStyles}`}
      >
        <span className="text-2xl mb-2">{module.icon}</span>
        <span className={`text-sm font-medium ${isGreyedOut ? "text-dark-muted" : "text-dark-text"}`}>{module.label}</span>
        <span className="mt-1.5 text-xs text-blue-400">Open ▸</span>
      </button>
    );
  }

  // Multi variant - checkbox
  return (
      <button
        type="button"
        onClick={isGreyedOut ? undefined : onSelect}
        onKeyDown={handleKeyDown}
        disabled={isGreyedOut}
      className={`flex flex-col items-center justify-center p-4 rounded-xl transition-colors min-h-[100px] min-w-[120px] text-left
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-dark-bg
        ${greyedOutStyles}`}
    >
      <div className="flex items-start w-full justify-between gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={isGreyedOut ? undefined : () => onSelect?.()}
          onClick={(e) => e.stopPropagation()}
          disabled={isGreyedOut}
          className="w-4 h-4 rounded border-2 border-dark-accent bg-dark-bg text-blue-600
            focus:ring-blue-500 focus:ring-offset-0 focus:ring-2 mt-0.5 flex-shrink-0 disabled:opacity-50"
          aria-label={`Select ${module.label}`}
        />
        <span className="text-2xl flex-shrink-0">{module.icon}</span>
      </div>
      <span className={`text-sm font-medium mt-2 w-full ${isGreyedOut ? "text-dark-muted" : "text-dark-text"}`}>{module.label}</span>
    </button>
  );
}
