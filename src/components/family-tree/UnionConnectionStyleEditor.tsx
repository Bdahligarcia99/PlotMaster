import { useCallback, useMemo, useState } from "react";
import {
  useFamilyTreeStore,
  DEFAULT_CONNECTION_STYLE,
  resolveUnionConnectionStyle,
  type ConnectionVisualStyle,
  type ConnectionStyleDef,
  type UnionNodeData,
} from "../../store/familyTreeStore";
import Input from "../ui/Input";
import ColorInput from "../ui/ColorInput";
import NumberSlider from "../ui/NumberSlider";
import Button from "../ui/Button";

interface UnionConnectionStyleEditorProps {
  unionId: string;
  onClose: () => void;
}

type StyleDraft = {
  id?: string;
  name: string;
  description?: string;
  stroke: string;
  strokeWidth: number;
  dashPattern: number[];
};

export function StylePreviewLine({
  style,
  width = 48,
  height = 16,
}: {
  style: ConnectionVisualStyle;
  width?: number;
  height?: number;
}) {
  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <line
        x1={2}
        y1={height / 2}
        x2={width - 2}
        y2={height / 2}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        strokeDasharray={style.dashPattern.length ? style.dashPattern.join(" ") : undefined}
      />
    </svg>
  );
}

function dashPairs(pattern: number[]): { dash: number; gap?: number }[] {
  const pairs: { dash: number; gap?: number }[] = [];
  for (let i = 0; i < pattern.length; i += 2) {
    pairs.push({ dash: pattern[i] ?? 0, gap: pattern[i + 1] });
  }
  return pairs;
}

function pairsToPattern(pairs: { dash: number; gap?: number }[]): number[] {
  const out: number[] = [];
  for (const p of pairs) {
    out.push(p.dash);
    if (p.gap != null) out.push(p.gap);
  }
  return out;
}

export default function UnionConnectionStyleEditor({ unionId, onClose }: UnionConnectionStyleEditorProps) {
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const connectionStyles = useFamilyTreeStore((s) => s.connectionStyles);
  const addConnectionStyle = useFamilyTreeStore((s) => s.addConnectionStyle);
  const updateConnectionStyle = useFamilyTreeStore((s) => s.updateConnectionStyle);
  const deleteConnectionStyle = useFamilyTreeStore((s) => s.deleteConnectionStyle);
  const duplicateConnectionStyle = useFamilyTreeStore((s) => s.duplicateConnectionStyle);
  const setUnionConnectionStyleId = useFamilyTreeStore((s) => s.setUnionConnectionStyleId);
  const setUnionConnectionStyleOverride = useFamilyTreeStore((s) => s.setUnionConnectionStyleOverride);

  const unionNode = nodes.find((n) => n.id === unionId && (n.data as UnionNodeData).kind === "union");
  const unionData = unionNode?.data as UnionNodeData | undefined;

  const effectiveStyle = useMemo(
    () => (unionData ? resolveUnionConnectionStyle(unionData, connectionStyles) : DEFAULT_CONNECTION_STYLE),
    [unionData, connectionStyles]
  );

  const [draft, setDraft] = useState<StyleDraft | null>(null);

  const previewStyle = draft ?? effectiveStyle;

  const startNewDraft = useCallback(() => {
    setDraft({
      name: "",
      description: "",
      ...DEFAULT_CONNECTION_STYLE,
    });
  }, []);

  const startEditDraft = useCallback((style: ConnectionStyleDef) => {
    setDraft({
      id: style.id,
      name: style.name,
      description: style.description ?? "",
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      dashPattern: [...style.dashPattern],
    });
  }, []);

  const updateDraft = useCallback((patch: Partial<StyleDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleSaveToLibrary = useCallback(() => {
    if (!draft) return;
    const payload = {
      name: draft.name.trim() || "Untitled",
      description: draft.description?.trim() || undefined,
      stroke: draft.stroke,
      strokeWidth: draft.strokeWidth,
      dashPattern: [...draft.dashPattern],
    };
    if (draft.id) {
      updateConnectionStyle(draft.id, payload);
    } else {
      const newId = addConnectionStyle(payload);
      setUnionConnectionStyleId(unionId, newId);
    }
    setDraft(null);
  }, [draft, addConnectionStyle, updateConnectionStyle, setUnionConnectionStyleId, unionId]);

  const handleUseWithoutSaving = useCallback(() => {
    if (!draft) return;
    setUnionConnectionStyleOverride(unionId, {
      stroke: draft.stroke,
      strokeWidth: draft.strokeWidth,
      dashPattern: [...draft.dashPattern],
      description: draft.description?.trim() || undefined,
    });
    setDraft(null);
  }, [draft, setUnionConnectionStyleOverride, unionId]);

  if (!unionData) return null;

  const hasOverride = !!unionData.connectionStyleOverride;
  const activeStyleId = hasOverride ? undefined : unionData.connectionStyleId;

  const presetBtnClass =
    "px-2 py-1 text-xs rounded border border-dark-accent bg-dark-bg text-dark-muted hover:text-dark-text hover:border-dark-muted";

  return (
    <div
      className="w-[320px] bg-dark-surface border border-dark-accent rounded-lg shadow-lg p-3 text-dark-text"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Connection Style</h3>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/50 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <StylePreviewLine style={previewStyle} width={120} height={24} />
        <span className="text-xs text-dark-muted">Preview</span>
      </div>

      {hasOverride && (
        <div className="mb-3 flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30">
          <span className="text-xs text-amber-200">Using custom override for this connection</span>
          <button
            type="button"
            onClick={() => setUnionConnectionStyleOverride(unionId, undefined)}
            className="text-xs text-amber-200 hover:text-amber-100 underline flex-shrink-0"
          >
            Clear override
          </button>
        </div>
      )}

      <div className="mb-2">
        <div className="text-xs text-dark-muted mb-1.5">Library</div>
        <div className="max-h-36 overflow-y-auto space-y-1">
          {connectionStyles.length === 0 && (
            <div className="text-xs text-dark-muted px-1 py-2">No saved styles yet</div>
          )}
          {connectionStyles.map((style) => {
            const isActive = !hasOverride && activeStyleId === style.id;
            return (
              <div
                key={style.id}
                role="button"
                tabIndex={0}
                onClick={() => setUnionConnectionStyleId(unionId, style.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setUnionConnectionStyleId(unionId, style.id);
                  }
                }}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer border ${
                  isActive
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-transparent hover:border-dark-accent hover:bg-dark-accent/30"
                }`}
              >
                <StylePreviewLine style={style} />
                <span className="flex-1 text-xs truncate">{style.name}</span>
                <button
                  type="button"
                  title="Edit"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditDraft(style);
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Duplicate"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateConnectionStyle(style.id);
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConnectionStyle(style.id);
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-red-400 hover:bg-dark-accent/50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={startNewDraft}
          className="mt-2 w-full px-2 py-1.5 text-xs rounded border border-dashed border-dark-accent text-dark-muted hover:text-dark-text hover:border-dark-muted"
        >
          + New Style
        </button>
      </div>

      {draft && (
        <div className="mt-3 pt-3 border-t border-dark-accent">
          <div className="text-xs text-dark-muted mb-2">{draft.id ? "Edit style" : "New style"}</div>
          <Input
            label="Name"
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            className="!mb-2 !py-2 !px-3 text-sm"
          />
          <div className="mb-2">
            <label className="block text-dark-muted text-sm mb-2">Description</label>
            <textarea
              value={draft.description ?? ""}
              onChange={(e) => updateDraft({ description: e.target.value })}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm resize-y min-h-[60px] focus:outline-none focus:border-blue-500"
              placeholder="Optional description shown as a tooltip..."
            />
          </div>
          <ColorInput
            label="Color"
            value={draft.stroke}
            onChange={(stroke) => updateDraft({ stroke })}
            className="!mb-2"
          />
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <NumberSlider
              label="Line weight"
              value={draft.strokeWidth}
              min={0.5}
              max={12}
              step={0.5}
              onChange={(strokeWidth) => updateDraft({ strokeWidth })}
              className="!mb-2"
            />
          </div>
          <div className="mb-2">
            <div className="text-dark-muted text-sm mb-2">Dash pattern</div>
            <div className="flex flex-wrap gap-1 mb-2">
              <button type="button" className={presetBtnClass} onClick={() => updateDraft({ dashPattern: [] })}>
                Solid
              </button>
              <button type="button" className={presetBtnClass} onClick={() => updateDraft({ dashPattern: [8, 4] })}>
                Dashed
              </button>
              <button type="button" className={presetBtnClass} onClick={() => updateDraft({ dashPattern: [1, 4] })}>
                Dotted
              </button>
              <button
                type="button"
                className={presetBtnClass}
                onClick={() => updateDraft({ dashPattern: [8, 4, 1, 4] })}
              >
                Dash-dot
              </button>
            </div>
            <div className="space-y-2">
              {dashPairs(draft.dashPattern).map((pair, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-dark-muted text-xs mb-1">Dash</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={pair.dash}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        if (Number.isNaN(n)) return;
                        const pairs = dashPairs(draft.dashPattern);
                        pairs[idx] = { ...pairs[idx]!, dash: n };
                        updateDraft({ dashPattern: pairsToPattern(pairs) });
                      }}
                      className="w-full px-2 py-1.5 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  {pair.gap != null && (
                    <div className="flex-1">
                      <label className="block text-dark-muted text-xs mb-1">Gap</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={pair.gap}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value);
                          if (Number.isNaN(n)) return;
                          const pairs = dashPairs(draft.dashPattern);
                          pairs[idx] = { ...pairs[idx]!, gap: n };
                          updateDraft({ dashPattern: pairsToPattern(pairs) });
                        }}
                        className="w-full px-2 py-1.5 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    title="Remove segment"
                    onClick={() => {
                      const pairs = dashPairs(draft.dashPattern);
                      pairs.splice(idx, 1);
                      updateDraft({ dashPattern: pairsToPattern(pairs) });
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded text-dark-muted hover:text-red-400 hover:bg-dark-accent/50 mb-0.5"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => updateDraft({ dashPattern: [...draft.dashPattern, 4, 4] })}
              className="mt-2 text-xs text-dark-muted hover:text-dark-text"
            >
              + Add segment
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button type="button" onClick={handleSaveToLibrary} className="!py-1.5 !px-3 text-xs">
              Save to Library
            </Button>
            <Button type="button" onClick={handleUseWithoutSaving} className="!py-1.5 !px-3 text-xs">
              Use without saving
            </Button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="px-3 py-1.5 text-xs text-dark-muted hover:text-dark-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
