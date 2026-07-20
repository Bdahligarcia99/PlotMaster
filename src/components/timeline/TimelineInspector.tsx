import { useEffect, useState } from "react";
import {
  getSelectedBeat,
  getSelectedLane,
  LANE_TYPE_PRESETS,
  useTimelineStore,
} from "../../store/timelineStore";

export default function TimelineInspector() {
  const lanes = useTimelineStore((s) => s.lanes);
  const beats = useTimelineStore((s) => s.beats);
  const primarySelectedNodeId = useTimelineStore((s) => s.primarySelectedNodeId);
  const updateLane = useTimelineStore((s) => s.updateLane);
  const updateBeat = useTimelineStore((s) => s.updateBeat);

  const selectedLane = getSelectedLane(lanes, beats, primarySelectedNodeId);
  const selectedBeat = getSelectedBeat(beats, primarySelectedNodeId);
  const editingLane = selectedBeat ? null : selectedLane;
  const editingBeat = selectedBeat;

  const [laneLabel, setLaneLabel] = useState("");
  const [laneType, setLaneType] = useState("character");
  const [laneTypeCustom, setLaneTypeCustom] = useState("");
  const [beatTitle, setBeatTitle] = useState("");
  const [beatDescription, setBeatDescription] = useState("");
  const [beatDate, setBeatDate] = useState("");

  useEffect(() => {
    if (editingLane) {
      setLaneLabel(editingLane.label);
      const preset = LANE_TYPE_PRESETS.includes(editingLane.laneType as (typeof LANE_TYPE_PRESETS)[number])
        ? editingLane.laneType
        : "custom";
      setLaneType(preset);
      setLaneTypeCustom(
        preset === "custom" ? editingLane.laneType : ""
      );
    }
  }, [editingLane?.id, editingLane?.label, editingLane?.laneType]);

  useEffect(() => {
    if (editingBeat) {
      setBeatTitle(editingBeat.title);
      setBeatDescription(editingBeat.description);
      setBeatDate(editingBeat.date);
    }
  }, [editingBeat?.id, editingBeat?.title, editingBeat?.description, editingBeat?.date]);

  if (!editingLane && !editingBeat) {
    return (
      <div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto">
        <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide mb-3">
          Inspector
        </h3>
        <p className="text-dark-muted text-xs">Select a lane or beat to edit properties.</p>
      </div>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto space-y-4">
      <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
        Inspector
      </h3>

      {editingLane && (
        <div className="space-y-3">
          <p className="text-xs text-dark-muted">Lane</p>
          <label className="block space-y-1">
            <span className="text-xs text-dark-muted">Label</span>
            <input
              type="text"
              value={laneLabel}
              onChange={(e) => setLaneLabel(e.target.value)}
              onBlur={() => {
                if (laneLabel.trim() && laneLabel !== editingLane.label) {
                  updateLane(editingLane.id, { label: laneLabel.trim() });
                }
              }}
              className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm focus:outline-none focus:border-blue-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-dark-muted">Lane type</span>
            <select
              value={laneType}
              onChange={(e) => {
                const next = e.target.value;
                setLaneType(next);
                if (next !== "custom") {
                  updateLane(editingLane.id, { laneType: next });
                }
              }}
              className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm focus:outline-none focus:border-blue-500"
            >
              {LANE_TYPE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>
          {laneType === "custom" && (
            <label className="block space-y-1">
              <span className="text-xs text-dark-muted">Custom type</span>
              <input
                type="text"
                value={laneTypeCustom}
                onChange={(e) => setLaneTypeCustom(e.target.value)}
                onBlur={() => {
                  const trimmed = laneTypeCustom.trim();
                  if (trimmed) updateLane(editingLane.id, { laneType: trimmed });
                }}
                className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm focus:outline-none focus:border-blue-500"
              />
            </label>
          )}
          <p className="text-[10px] text-dark-muted font-mono truncate" title={editingLane.id}>
            id: {editingLane.id}
          </p>
        </div>
      )}

      {editingBeat && (
        <div className="space-y-3">
          <p className="text-xs text-dark-muted">Beat</p>
          <label className="block space-y-1">
            <span className="text-xs text-dark-muted">Title</span>
            <input
              type="text"
              value={beatTitle}
              onChange={(e) => setBeatTitle(e.target.value)}
              onBlur={() => {
                if (beatTitle !== editingBeat.title) {
                  updateBeat(editingBeat.id, { title: beatTitle });
                }
              }}
              className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm focus:outline-none focus:border-blue-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-dark-muted">Description</span>
            <textarea
              value={beatDescription}
              onChange={(e) => setBeatDescription(e.target.value)}
              onBlur={() => {
                if (beatDescription !== editingBeat.description) {
                  updateBeat(editingBeat.id, { description: beatDescription });
                }
              }}
              rows={3}
              className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm resize-none focus:outline-none focus:border-blue-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-dark-muted">Date</span>
            <input
              type="text"
              value={beatDate}
              onChange={(e) => setBeatDate(e.target.value)}
              onBlur={() => {
                if (beatDate !== editingBeat.date) {
                  updateBeat(editingBeat.id, { date: beatDate });
                }
              }}
              placeholder="Story date or label"
              className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm focus:outline-none focus:border-blue-500"
            />
          </label>
          <p className="text-[10px] text-dark-muted font-mono truncate" title={editingBeat.id}>
            id: {editingBeat.id}
          </p>
        </div>
      )}
    </div>
  );
}
