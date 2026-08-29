import { useState } from "react";
import type { IconRef } from "./iconRegistry";
import {
  EMOJI_CATEGORIES,
  ICON_REGISTRY_KEYS,
  getConnectionIcon,
  renderConnectionIcon,
} from "./iconRegistry";

interface IconPickerProps {
  value?: IconRef;
  onSelect: (icon: IconRef) => void;
  onClear: () => void;
  onBack?: () => void;
  title?: string;
}

export default function IconPicker({
  value,
  onSelect,
  onClear,
  onBack,
  title = "Assign icon",
}: IconPickerProps) {
  const [tab, setTab] = useState<"emoji" | "icons">("emoji");

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-dark-muted hover:text-dark-text"
            aria-label="Back"
          >
            ←
          </button>
        )}
        <span className="text-xs text-dark-muted flex-1">{title}</span>
        {value && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] text-dark-muted hover:text-red-400"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex gap-1 mb-2">
        <button
          type="button"
          onClick={() => setTab("emoji")}
          className={`flex-1 py-1 text-[10px] rounded border ${
            tab === "emoji"
              ? "border-blue-500 bg-blue-500/10 text-blue-400"
              : "border-dark-accent text-dark-muted hover:text-dark-text"
          }`}
        >
          Emoji
        </button>
        <button
          type="button"
          onClick={() => setTab("icons")}
          className={`flex-1 py-1 text-[10px] rounded border ${
            tab === "icons"
              ? "border-blue-500 bg-blue-500/10 text-blue-400"
              : "border-dark-accent text-dark-muted hover:text-dark-text"
          }`}
        >
          Icons
        </button>
      </div>
      {value && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded border border-dark-accent bg-dark-bg/50">
          <span className="text-[10px] text-dark-muted">Selected:</span>
          {renderConnectionIcon(value, 18)}
        </div>
      )}
      <div className="max-h-[65vh] overflow-y-auto nowheel">
        {tab === "emoji" ? (
          <div className="space-y-2">
            {EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <div className="text-[10px] text-dark-muted mb-1">{cat.label}</div>
                <div className="flex flex-wrap gap-1">
                  {cat.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      title={emoji}
                      onClick={() => onSelect({ kind: "emoji", value: emoji })}
                      className={`w-8 h-8 flex items-center justify-center rounded text-lg hover:bg-dark-accent/40 ${
                        value?.kind === "emoji" && value.value === emoji
                          ? "ring-1 ring-blue-500 bg-blue-500/10"
                          : ""
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-1">
            {ICON_REGISTRY_KEYS.map((key) => {
              const Comp = getConnectionIcon(key);
              if (!Comp) return null;
              return (
                <button
                  key={key}
                  type="button"
                  title={key.split(":")[1]}
                  onClick={() => onSelect({ kind: "icon", value: key })}
                  className={`w-8 h-8 flex items-center justify-center rounded hover:bg-dark-accent/40 text-dark-text ${
                    value?.kind === "icon" && value.value === key
                      ? "ring-1 ring-blue-500 bg-blue-500/10"
                      : ""
                  }`}
                >
                  <Comp size={16} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function IconDisplay({ icon, size = 16 }: { icon?: IconRef; size?: number }) {
  if (!icon) return null;
  return <>{renderConnectionIcon(icon, size)}</>;
}
