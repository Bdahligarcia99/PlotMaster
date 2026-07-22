import type { BeatDateSpec, TimelineBeat } from "../../store/timelineTypes";
import { resolveBeatDate } from "../../utils/beatDate";

interface BeatDateEditorProps {
  beatId: string;
  laneId: string;
  dateSpec: BeatDateSpec;
  laneBeats: TimelineBeat[];
  allBeats: TimelineBeat[];
  onChange: (spec: BeatDateSpec) => void;
  compact?: boolean;
}

export default function BeatDateEditor({
  beatId,
  laneId,
  dateSpec,
  laneBeats,
  allBeats,
  onChange,
  compact = false,
}: BeatDateEditorProps) {
  const originCandidates = laneBeats
    .filter((b) => b.id !== beatId)
    .sort((a, b) => a.slot - b.slot);

  const previewBeat: TimelineBeat = {
    id: beatId,
    laneId,
    slot: 0,
    kind: "story",
    title: "",
    synopsis: "",
    detail: "",
    dateSpec,
  };
  const resolvedPreview = resolveBeatDate(previewBeat, allBeats);

  return (
    <div className={`space-y-2 ${compact ? "" : "rounded border border-dark-accent/40 p-2"}`}>
      <span className="text-xs text-dark-muted">Date / Label</span>
      <div className="flex flex-wrap gap-1">
        {(["none", "resolved", "label", "absolute", "relative"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              if (mode === dateSpec.mode) return;
              if (mode === "none") onChange({ mode: "none" });
              if (mode === "resolved")
                onChange({ mode: "resolved", resolved: dateSpec.resolved ?? dateSpec.label ?? "" });
              if (mode === "label") onChange({ mode: "label", label: dateSpec.label ?? "" });
              if (mode === "absolute")
                onChange({ mode: "absolute", absolute: dateSpec.absolute ?? "" });
              if (mode === "relative")
                onChange({
                  mode: "relative",
                  relative: {
                    years: 0,
                    months: 0,
                    days: 0,
                    originBeatId: originCandidates[0]?.id ?? "",
                  },
                });
            }}
            className={`px-2 py-0.5 rounded text-[11px] border ${
              dateSpec.mode === mode
                ? "border-blue-500 bg-blue-500/20 text-blue-200"
                : "border-dark-accent text-dark-muted hover:text-dark-text"
            }`}
          >
            {mode === "none"
              ? "None"
              : mode === "resolved"
                ? "Resolved"
                : mode === "label"
                  ? "Label"
                  : mode === "absolute"
                    ? "Actual date"
                    : "Relative"}
          </button>
        ))}
      </div>

      {dateSpec.mode === "resolved" && (
        <input
          type="text"
          value={dateSpec.resolved ?? ""}
          onChange={(e) => onChange({ mode: "resolved", resolved: e.target.value })}
          placeholder="Auto-detected date text"
          className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm focus:outline-none focus:border-blue-500"
        />
      )}

      {dateSpec.mode === "label" && (
        <input
          type="text"
          value={dateSpec.label ?? ""}
          onChange={(e) => onChange({ mode: "label", label: e.target.value })}
          placeholder="Story date or label"
          className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm focus:outline-none focus:border-blue-500"
        />
      )}

      {dateSpec.mode === "absolute" && (
        <input
          type="date"
          value={dateSpec.absolute ?? ""}
          onChange={(e) => onChange({ mode: "absolute", absolute: e.target.value })}
          className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm focus:outline-none focus:border-blue-500"
        />
      )}

      {dateSpec.mode === "relative" && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-dark-muted">Years</span>
              <input
                type="number"
                min={0}
                value={dateSpec.relative?.years ?? 0}
                onChange={(e) =>
                  onChange({
                    mode: "relative",
                    relative: {
                      years: Number(e.target.value) || 0,
                      months: dateSpec.relative?.months ?? 0,
                      days: dateSpec.relative?.days ?? 0,
                      originBeatId: dateSpec.relative?.originBeatId ?? "",
                    },
                  })
                }
                className="w-full px-2 py-1 rounded bg-dark-bg border border-dark-accent text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-dark-muted">Months</span>
              <input
                type="number"
                min={0}
                value={dateSpec.relative?.months ?? 0}
                onChange={(e) =>
                  onChange({
                    mode: "relative",
                    relative: {
                      years: dateSpec.relative?.years ?? 0,
                      months: Number(e.target.value) || 0,
                      days: dateSpec.relative?.days ?? 0,
                      originBeatId: dateSpec.relative?.originBeatId ?? "",
                    },
                  })
                }
                className="w-full px-2 py-1 rounded bg-dark-bg border border-dark-accent text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-dark-muted">Days</span>
              <input
                type="number"
                min={0}
                value={dateSpec.relative?.days ?? 0}
                onChange={(e) =>
                  onChange({
                    mode: "relative",
                    relative: {
                      years: dateSpec.relative?.years ?? 0,
                      months: dateSpec.relative?.months ?? 0,
                      days: Number(e.target.value) || 0,
                      originBeatId: dateSpec.relative?.originBeatId ?? "",
                    },
                  })
                }
                className="w-full px-2 py-1 rounded bg-dark-bg border border-dark-accent text-sm"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[10px] text-dark-muted">Origin beat</span>
            <select
              value={dateSpec.relative?.originBeatId ?? ""}
              onChange={(e) =>
                onChange({
                  mode: "relative",
                  relative: {
                    years: dateSpec.relative?.years ?? 0,
                    months: dateSpec.relative?.months ?? 0,
                    days: dateSpec.relative?.days ?? 0,
                    originBeatId: e.target.value,
                  },
                })
              }
              className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-sm"
            >
              <option value="">Select origin beat…</option>
              {originCandidates.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title || "Beat"} (slot {b.slot})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {resolvedPreview && (
        <p className="text-[10px] text-dark-muted">
          Preview: <span className="text-dark-text">{resolvedPreview}</span>
        </p>
      )}
    </div>
  );
}
