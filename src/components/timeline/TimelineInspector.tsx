import { useEffect, useMemo, useState } from "react";
import {
  getSelectedBeat,
  getSelectedConnection,
  getSelectedLane,
  LANE_TYPE_PRESETS,
  resolveLaneIdFromSelection,
  useTimelineStore,
} from "../../store/timelineStore";
import type { BeatDateSpec } from "../../store/timelineTypes";
import BeatDateEditor from "./BeatDateEditor";
import TimelineInspectorMultiBeatPanel from "./import/TimelineInspectorMultiBeatPanel";

export type InspectorMode = "isolation" | "multi";

interface TimelineInspectorProps {
  width?: number;
  collapsedWidth?: number;
  onResizePointerDown?: (e: React.PointerEvent) => void;
  onToggleExpand?: () => void;
  mode?: InspectorMode;
  onModeChange?: (mode: InspectorMode) => void;
}

function InspectorShell({
  width,
  collapsedWidth = 256,
  onResizePointerDown,
  onToggleExpand,
  mode,
  onModeChange,
  children,
}: {
  width?: number;
  collapsedWidth?: number;
  onResizePointerDown?: (e: React.PointerEvent) => void;
  onToggleExpand?: () => void;
  mode: InspectorMode;
  onModeChange: (mode: InspectorMode) => void;
  children: React.ReactNode;
}) {
  const isExpanded = width != null && width > collapsedWidth + 8;

  return (
    <div
      className="absolute inset-y-0 right-0 z-30 flex border-l border-dark-accent bg-dark-surface shadow-2xl"
      style={width != null ? { width } : undefined}
    >
      {onResizePointerDown && (
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onResizePointerDown}
          className="w-2 flex-shrink-0 cursor-col-resize flex items-center justify-center group hover:bg-dark-accent/30 transition-colors select-none"
        >
          <div className="w-0.5 h-8 rounded-full bg-dark-muted/40 group-hover:bg-dark-muted/70" />
        </div>
      )}
      <div className="flex-1 min-w-0 p-4 overflow-y-auto flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
            Inspector
          </h3>
          <div className="flex items-center gap-1">
            {onToggleExpand && width != null && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="p-1 rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
                title={isExpanded ? "Collapse inspector" : "Expand inspector"}
              >
                {isExpanded ? "«" : "»"}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onModeChange(mode === "multi" ? "isolation" : "multi")}
            className={`px-2 py-0.5 rounded text-[11px] border ${
              mode !== "multi"
                ? "border-blue-500/60 bg-blue-500/10 text-blue-200"
                : "border-dark-accent text-dark-muted"
            }`}
            title="Isolation mode shows one beat at a time"
          >
            Isolation {mode !== "multi" ? "ON" : "OFF"}
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

export default function TimelineInspector({
  width,
  collapsedWidth = 256,
  onResizePointerDown,
  onToggleExpand,
  mode: externalMode,
  onModeChange: externalOnModeChange,
}: TimelineInspectorProps) {
  const [internalMode, setInternalMode] = useState<InspectorMode>("isolation");
  const mode = externalMode ?? internalMode;
  const onModeChange = externalOnModeChange ?? setInternalMode;
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
  const activeLaneId = resolveLaneIdFromSelection(lanes, beats, selection);

  const [laneLabel, setLaneLabel] = useState("");
  const [laneType, setLaneType] = useState("character");
  const [laneTypeCustom, setLaneTypeCustom] = useState("");
  const [beatTitle, setBeatTitle] = useState("");
  const [beatSynopsis, setBeatSynopsis] = useState("");
  const [beatDetail, setBeatDetail] = useState("");
  const [beatDateSpec, setBeatDateSpec] = useState<BeatDateSpec>({ mode: "none" });
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
      setLaneTypeCustom(preset === "custom" ? editingLane.laneType : "");
    }
  }, [editingLane?.id, editingLane?.label, editingLane?.laneType]);

  useEffect(() => {
    if (editingBeat) {
      setBeatTitle(editingBeat.title);
      setBeatSynopsis(editingBeat.synopsis);
      setBeatDetail(editingBeat.detail);
      setBeatDateSpec(editingBeat.dateSpec);
    }
  }, [editingBeat?.id, editingBeat?.title, editingBeat?.synopsis, editingBeat?.detail, editingBeat?.dateSpec]);

  useEffect(() => {
    if (editingConnection) {
      setConnectionTitle(editingConnection.title);
      setConnectionDescription(editingConnection.description);
      setConnectionDate(editingConnection.date);
    }
  }, [editingConnection?.id, editingConnection?.title, editingConnection?.description, editingConnection?.date]);

  const laneBeats = useMemo(
    () =>
      activeLaneId
        ? beats.filter((b) => b.laneId === activeLaneId).sort((a, b) => a.slot - b.slot)
        : [],
    [beats, activeLaneId]
  );

  if (mode === "multi" && activeLaneId) {
    return (
      <InspectorShell
        width={width ?? collapsedWidth}
        collapsedWidth={collapsedWidth}
        onResizePointerDown={onResizePointerDown}
        onToggleExpand={onToggleExpand}
        mode={mode}
        onModeChange={onModeChange}
      >
        <TimelineInspectorMultiBeatPanel
          laneId={activeLaneId}
          initialBeatId={editingBeat?.id ?? null}
        />
      </InspectorShell>
    );
  }

  if (!editingLane && !editingBeat && !editingConnection) {
    return (
      <InspectorShell
        width={width ?? collapsedWidth}
        collapsedWidth={collapsedWidth}
        onResizePointerDown={onResizePointerDown}
        onToggleExpand={onToggleExpand}
        mode={mode}
        onModeChange={onModeChange}
      >
        <p className="text-dark-muted text-xs">
          Select a lane, beat, or crossing to edit properties.
        </p>
      </InspectorShell>
    );
  }

  return (
    <InspectorShell
      width={width ?? collapsedWidth}
      collapsedWidth={collapsedWidth}
      onResizePointerDown={onResizePointerDown}
      onToggleExpand={onToggleExpand}
      mode={mode}
      onModeChange={onModeChange}
    >
      <div className="space-y-4">
        {editingLane && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-dark-muted">Lane</p>
              <button
                type="button"
                onClick={() => removeLane(editingLane.id)}
                className="text-xs text-red-400 hover:text-red-300"
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
                className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-dark-muted">Lane type</span>
              <select
                value={laneType}
                onChange={(e) => {
                  const next = e.target.value;
                  setLaneType(next);
                  if (next !== "custom") updateLane(editingLane.id, { laneType: next });
                }}
                className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm"
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
                  className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm"
                />
              </label>
            )}
          </div>
        )}

        {editingBeat && mode === "isolation" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-dark-muted">Beat</p>
              <button
                type="button"
                onClick={() => removeBeat(editingBeat.id)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </div>
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
                className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-dark-muted">Synopsis</span>
              <textarea
                value={beatSynopsis}
                onChange={(e) => setBeatSynopsis(e.target.value)}
                onBlur={() => {
                  if (beatSynopsis !== editingBeat.synopsis) {
                    updateBeat(editingBeat.id, { synopsis: beatSynopsis });
                  }
                }}
                rows={3}
                className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm resize-y"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-dark-muted">Detail</span>
              <textarea
                value={beatDetail}
                onChange={(e) => setBeatDetail(e.target.value)}
                onBlur={() => {
                  if (beatDetail !== editingBeat.detail) {
                    updateBeat(editingBeat.id, { detail: beatDetail });
                  }
                }}
                rows={6}
                className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm resize-y"
              />
            </label>
            <BeatDateEditor
              beatId={editingBeat.id}
              laneId={editingBeat.laneId}
              dateSpec={beatDateSpec}
              laneBeats={laneBeats}
              allBeats={beats}
              onChange={(spec) => {
                setBeatDateSpec(spec);
                updateBeat(editingBeat.id, { dateSpec: spec });
              }}
            />
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
              >
                Delete
              </button>
            </div>
            <p className="text-xs text-dark-muted">
              {editingConnection.beatIds
                .map((beatId) => beats.find((b) => b.id === beatId)?.title || "Beat")
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
                className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-sm"
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
                className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-sm resize-none"
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
                className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-sm"
              />
            </label>
          </div>
        )}
      </div>
    </InspectorShell>
  );
}
