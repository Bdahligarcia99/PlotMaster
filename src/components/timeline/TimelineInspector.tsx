import { useEffect, useState } from "react";
import {
  getSelectedBeat,
  getSelectedConnection,
  getSelectedLane,
  LANE_TYPE_PRESETS,
  useTimelineStore,
} from "../../store/timelineStore";

export default function TimelineInspector() {
  const lanes = useTimelineStore((s) => s.lanes);
  const beats = useTimelineStore((s) => s.beats);
  const connections = useTimelineStore((s) => s.connections);
  const selection = useTimelineStore((s) => s.selection);
  const updateLane = useTimelineStore((s) => s.updateLane);
  const updateBeat = useTimelineStore((s) => s.updateBeat);
  const updateConnection = useTimelineStore((s) => s.updateConnection);
  const removeConnection = useTimelineStore((s) => s.removeConnection);
  const removeLane = useTimelineStore((s) => s.removeLane);
  const removeBeat = useTimelineStore((s) => s.removeBeat);

  const editingLane = getSelectedLane(lanes, selection);
  const editingBeat = getSelectedBeat(beats, selection);
  const editingConnection = getSelectedConnection(connections, selection);

  const [laneLabel, setLaneLabel] = useState("");
  const [laneType, setLaneType] = useState("character");
  const [laneTypeCustom, setLaneTypeCustom] = useState("");
  const [beatTitle, setBeatTitle] = useState("");
  const [beatDescription, setBeatDescription] = useState("");
  const [beatDate, setBeatDate] = useState("");
  const [connectionTitle, setConnectionTitle] = useState("");
  const [connectionDescription, setConnectionDescription] = useState("");
  const [connectionDate, setConnectionDate] = useState("");

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

  useEffect(() => {
    if (editingConnection) {
      setConnectionTitle(editingConnection.title);
      setConnectionDescription(editingConnection.description);
      setConnectionDate(editingConnection.date);
    }
  }, [editingConnection?.id, editingConnection?.title, editingConnection?.description, editingConnection?.date]);

  if (!editingLane && !editingBeat && !editingConnection) {
    return (
      <div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto">
        <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide mb-3">
          Inspector
        </h3>
        <p className="text-dark-muted text-xs">Select a lane, beat, or crossing to edit properties.</p>
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
          <div className="flex items-center justify-between">
            <p className="text-xs text-dark-muted">Lane</p>
            <button
              type="button"
              onClick={() => removeLane(editingLane.id)}
              className="text-xs text-red-400 hover:text-red-300"
              title="Delete lane and its beats"
            >
              Delete
            </button>
          </div>
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
          <div className="flex items-center justify-between">
            <p className="text-xs text-dark-muted">Beat</p>
            <button
              type="button"
              onClick={() => removeBeat(editingBeat.id)}
              className="text-xs text-red-400 hover:text-red-300"
              title="Delete beat"
            >
              Delete
            </button>
          </div>
          {editingBeat.kind === "empty" ? (
            <p className="text-xs text-dark-muted italic">
              Empty beat — spacer only, no properties.
            </p>
          ) : (
            <>
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
            </>
          )}
          <p className="text-[10px] text-dark-muted font-mono truncate" title={editingBeat.id}>
            id: {editingBeat.id}
          </p>
        </div>
      )}

      {editingConnection && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-dark-muted">Crossing</p>
            <button
              type="button"
              onClick={() => removeConnection(editingConnection.id)}
              className="text-xs text-red-400 hover:text-red-300"
              title="Delete this crossing connector"
            >
              Delete
            </button>
          </div>
          <p className="text-xs text-dark-muted">
            {editingConnection.beatIds
              .map((beatId) => {
                const beat = beats.find((b) => b.id === beatId);
                if (!beat) return "Beat";
                if (beat.kind === "empty") return "(empty)";
                return beat.title || "Beat";
              })
              .join(" ↔ ")}
          </p>
          <label className="block space-y-1">
            <span className="text-xs text-dark-muted">Title</span>
            <input
              type="text"
              value={connectionTitle}
              onChange={(e) => setConnectionTitle(e.target.value)}
              onBlur={() => {
                if (connectionTitle !== editingConnection.title) {
                  updateConnection(editingConnection.id, { title: connectionTitle });
                }
              }}
              placeholder="What links these beats?"
              className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm focus:outline-none focus:border-blue-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-dark-muted">Description</span>
            <textarea
              value={connectionDescription}
              onChange={(e) => setConnectionDescription(e.target.value)}
              onBlur={() => {
                if (connectionDescription !== editingConnection.description) {
                  updateConnection(editingConnection.id, { description: connectionDescription });
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
              value={connectionDate}
              onChange={(e) => setConnectionDate(e.target.value)}
              onBlur={() => {
                if (connectionDate !== editingConnection.date) {
                  updateConnection(editingConnection.id, { date: connectionDate });
                }
              }}
              className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm focus:outline-none focus:border-blue-500"
            />
          </label>
          <p className="text-[10px] text-dark-muted font-mono truncate" title={editingConnection.id}>
            id: {editingConnection.id}
          </p>
        </div>
      )}
    </div>
  );
}
