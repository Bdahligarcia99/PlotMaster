import { useMemo, useState } from "react";
import Button from "../../ui/Button";
import { useTimelineStore } from "../../../store/timelineStore";
import BeatDateEditor from "../BeatDateEditor";
import type { BeatDateSpec } from "../../../store/timelineTypes";

interface PendingInsert {
  tempId: string;
  slot: number;
}

interface TimelineInspectorMultiBeatPanelProps {
  laneId: string;
  initialBeatId: string | null;
}

export default function TimelineInspectorMultiBeatPanel({
  laneId,
  initialBeatId,
}: TimelineInspectorMultiBeatPanelProps) {
  const beats = useTimelineStore((s) => s.beats);
  const updateBeat = useTimelineStore((s) => s.updateBeat);
  const insertPendingBeats = useTimelineStore((s) => s.insertPendingBeats);

  const laneBeats = useMemo(
    () => beats.filter((b) => b.laneId === laneId).sort((a, b) => a.slot - b.slot),
    [beats, laneId]
  );

  const [editingBeatId, setEditingBeatId] = useState<string | null>(
    initialBeatId ?? laneBeats[laneBeats.length - 1]?.id ?? null
  );
  const [pendingInserts, setPendingInserts] = useState<PendingInsert[]>([]);

  const editingBeat = laneBeats.find((b) => b.id === editingBeatId) ?? null;

  const [title, setTitle] = useState(editingBeat?.title ?? "");
  const [synopsis, setSynopsis] = useState(editingBeat?.synopsis ?? "");
  const [detail, setDetail] = useState(editingBeat?.detail ?? "");
  const [dateSpec, setDateSpec] = useState<BeatDateSpec>(
    editingBeat?.dateSpec ?? { mode: "none" }
  );

  const selectBeat = (beatId: string) => {
    const beat = laneBeats.find((b) => b.id === beatId);
    setEditingBeatId(beatId);
    if (beat) {
      setTitle(beat.title);
      setSynopsis(beat.synopsis);
      setDetail(beat.detail);
      setDateSpec(beat.dateSpec);
    }
  };

  const saveCurrentBeat = () => {
    if (!editingBeatId) return;
    updateBeat(editingBeatId, { title, synopsis, detail, dateSpec });
  };

  const addPendingInsert = (slot: number) => {
    setPendingInserts((prev) => [
      ...prev,
      { tempId: `pending-${Date.now()}-${Math.random()}`, slot },
    ]);
  };

  const handleApply = () => {
    saveCurrentBeat();
    if (pendingInserts.length > 0) {
      insertPendingBeats(
        laneId,
        pendingInserts.map((p) => p.slot)
      );
      setPendingInserts([]);
    }
  };

  const listItems: Array<
    | { kind: "insert-gap"; slot: number; key: string }
    | { kind: "beat"; beatId: string; key: string }
    | { kind: "pending"; pending: PendingInsert; key: string }
  > = [];

  const topSlot =
    laneBeats.length > 0 ? Math.max(...laneBeats.map((b) => b.slot)) + 1 : 0;
  listItems.push({ kind: "insert-gap", slot: topSlot, key: "gap-top" });

  for (let i = laneBeats.length - 1; i >= 0; i--) {
    const beat = laneBeats[i];
    listItems.push({ kind: "beat", beatId: beat.id, key: beat.id });
    const gapSlot = beat.slot;
    listItems.push({ kind: "insert-gap", slot: gapSlot, key: `gap-${gapSlot}` });
    for (const pending of pendingInserts.filter((p) => p.slot === gapSlot)) {
      listItems.push({ kind: "pending", pending, key: pending.tempId });
    }
  }

  return (
    <div className="space-y-3 min-h-0 flex flex-col">
      <p className="text-xs text-dark-muted">
        Multi-beat mode — browse beats on this lane. Pending inserts appear only here until Apply.
      </p>

      <div className="overflow-y-auto space-y-1 max-h-[28vh] pr-1 border border-dark-accent/30 rounded-lg p-2">
        {listItems.map((item) => {
          if (item.kind === "insert-gap") {
            return (
              <div
                key={item.key}
                className="group relative h-4 flex items-center justify-center"
              >
                <button
                  type="button"
                  onClick={() => addPendingInsert(item.slot)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] px-2 py-0.5 rounded border border-dashed border-blue-500/50 text-blue-300 hover:bg-blue-500/10"
                >
                  + Insert beat
                </button>
              </div>
            );
          }
          if (item.kind === "pending") {
            return (
              <div
                key={item.key}
                className="rounded border border-dashed border-amber-500/50 px-2 py-1.5 text-xs text-amber-200/80"
              >
                Pending beat at slot {item.pending.slot}
              </div>
            );
          }
          const beat = laneBeats.find((b) => b.id === item.beatId)!;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => selectBeat(beat.id)}
              className={`w-full text-left rounded px-2 py-1.5 text-xs border ${
                editingBeatId === beat.id
                  ? "border-blue-500 bg-blue-500/10 text-dark-text"
                  : "border-dark-accent/40 text-dark-muted hover:text-dark-text hover:bg-dark-accent/30"
              }`}
            >
              {beat.title || "Beat"} · slot {beat.slot}
            </button>
          );
        })}
      </div>

      {editingBeat && (
        <div className="space-y-3 border-t border-dark-accent/40 pt-3">
          <p className="text-xs text-dark-muted">Editing: {editingBeat.title || "Beat"}</p>
          <label className="block space-y-1">
            <span className="text-xs text-dark-muted">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveCurrentBeat}
              className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-dark-muted">Synopsis</span>
            <textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              onBlur={saveCurrentBeat}
              rows={2}
              className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-sm resize-y"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-dark-muted">Detail</span>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              onBlur={saveCurrentBeat}
              rows={4}
              className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-sm resize-y"
            />
          </label>
          <BeatDateEditor
            beatId={editingBeat.id}
            laneId={laneId}
            dateSpec={dateSpec}
            laneBeats={laneBeats}
            allBeats={beats}
            onChange={(spec) => {
              setDateSpec(spec);
              updateBeat(editingBeat.id, { dateSpec: spec });
            }}
          />
        </div>
      )}

      {pendingInserts.length > 0 && (
        <div className="flex gap-2 pt-2 border-t border-dark-accent/40">
          <Button variant="primary" size="sm" onClick={handleApply}>
            Apply ({pendingInserts.length} pending)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPendingInserts([])}>
            Cancel pending
          </Button>
        </div>
      )}
    </div>
  );
}
