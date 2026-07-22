import { useEffect, useMemo, useState } from "react";
import Button from "../../ui/Button";
import {
  getPrimarySelection,
  getSelectedBeatIds,
  isSelected,
  useTimelineStore,
} from "../../../store/timelineStore";
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
  const selection = useTimelineStore((s) => s.selection);
  const updateBeat = useTimelineStore((s) => s.updateBeat);
  const insertPendingBeats = useTimelineStore((s) => s.insertPendingBeats);
  const selectOnly = useTimelineStore((s) => s.selectOnly);
  const toggleSelection = useTimelineStore((s) => s.toggleSelection);
  const removeBeats = useTimelineStore((s) => s.removeBeats);

  const laneBeats = useMemo(
    () => beats.filter((b) => b.laneId === laneId).sort((a, b) => a.slot - b.slot),
    [beats, laneId]
  );

  const primaryBeatId = useMemo(() => {
    const primary = getPrimarySelection(selection);
    if (primary?.type === "beat") return primary.id;
    return initialBeatId ?? laneBeats[laneBeats.length - 1]?.id ?? null;
  }, [selection, initialBeatId, laneBeats]);

  const [editingBeatId, setEditingBeatId] = useState<string | null>(primaryBeatId);
  const [pendingInserts, setPendingInserts] = useState<PendingInsert[]>([]);

  useEffect(() => {
    if (primaryBeatId && laneBeats.some((b) => b.id === primaryBeatId)) {
      setEditingBeatId(primaryBeatId);
    }
  }, [primaryBeatId, laneBeats]);

  const editingBeat = laneBeats.find((b) => b.id === editingBeatId) ?? null;

  const [title, setTitle] = useState(editingBeat?.title ?? "");
  const [synopsis, setSynopsis] = useState(editingBeat?.synopsis ?? "");
  const [detail, setDetail] = useState(editingBeat?.detail ?? "");
  const [dateSpec, setDateSpec] = useState<BeatDateSpec>(
    editingBeat?.dateSpec ?? { mode: "none" }
  );

  useEffect(() => {
    if (editingBeat) {
      setTitle(editingBeat.title);
      setSynopsis(editingBeat.synopsis);
      setDetail(editingBeat.detail);
      setDateSpec(editingBeat.dateSpec);
    }
  }, [
    editingBeat?.id,
    editingBeat?.title,
    editingBeat?.synopsis,
    editingBeat?.detail,
    editingBeat?.dateSpec,
  ]);

  const selectBeat = (beatId: string, e: React.MouseEvent) => {
    const beatItem = { type: "beat" as const, id: beatId };
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      toggleSelection(beatItem);
    } else {
      selectOnly(beatItem);
    }
    setEditingBeatId(beatId);
    const beat = laneBeats.find((b) => b.id === beatId);
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

  const handleDeleteSelected = () => {
    const ids = getSelectedBeatIds(selection).filter((id) =>
      laneBeats.some((b) => b.id === id)
    );
    if (ids.length === 0 && editingBeatId) {
      removeBeats([editingBeatId]);
      return;
    }
    if (ids.length > 0) removeBeats(ids);
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

  const deleteCount = Math.max(
    getSelectedBeatIds(selection).filter((id) => laneBeats.some((b) => b.id === id)).length,
    editingBeatId ? 1 : 0
  );

  return (
    <div className="space-y-3 min-h-0 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-dark-muted">
          Multi-beat mode — browse beats on this lane. Pending inserts appear only here until Apply.
        </p>
        {deleteCount > 0 && (
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="text-xs text-red-400 hover:text-red-300 shrink-0"
          >
            Delete{deleteCount > 1 ? ` (${deleteCount})` : ""}
          </button>
        )}
      </div>

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
          const beatItem = { type: "beat" as const, id: beat.id };
          const highlighted = isSelected(selection, beatItem);
          return (
            <button
              key={item.key}
              type="button"
              onClick={(e) => selectBeat(beat.id, e)}
              className={`w-full text-left rounded px-2 py-1.5 text-xs border ${
                highlighted
                  ? "border-blue-500 bg-blue-500/10 text-dark-text"
                  : "border-dark-accent/40 text-dark-muted hover:text-dark-text hover:bg-dark-accent/30"
              } ${editingBeatId === beat.id && !highlighted ? "ring-1 ring-blue-500/40" : ""}`}
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
