import { useState, useEffect } from "react";
import Button from "../ui/Button";
import { useTimelineStore, ZOOM_LANE_COUNT_STEPS } from "../../store/timelineStore";
import {
  BEAT_WIDTH_PERCENT_MAX,
  BEAT_WIDTH_PERCENT_MIN,
  EXPANDED_BEAT_HEIGHT_MAX,
  EXPANDED_BEAT_HEIGHT_MIN,
} from "../../store/timelineTypes";

export default function TimelineToolbar() {
  const lanes = useTimelineStore((s) => s.lanes);
  const selection = useTimelineStore((s) => s.selection);
  const zoomLaneCount = useTimelineStore((s) => s.zoomLaneCount);
  const beatWidthPercent = useTimelineStore((s) => s.beatWidthPercent);
  const beatsExpanded = useTimelineStore((s) => s.beatsExpanded);
  const expandedBeatHeightPx = useTimelineStore((s) => s.expandedBeatHeightPx);
  const addLane = useTimelineStore((s) => s.addLane);
  const addBeat = useTimelineStore((s) => s.addBeat);
  const connections = useTimelineStore((s) => s.connections);
  const toggleConnection = useTimelineStore((s) => s.toggleConnection);
  const setZoomLaneCount = useTimelineStore((s) => s.setZoomLaneCount);
  const setBeatWidthPercent = useTimelineStore((s) => s.setBeatWidthPercent);
  const setBeatsExpanded = useTimelineStore((s) => s.setBeatsExpanded);
  const setExpandedBeatHeightPx = useTimelineStore((s) => s.setExpandedBeatHeightPx);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const canAddBeat = lanes.length > 0;
  const selectedBeats = selection.filter((s) => s.type === "beat");
  const canConnect = selectedBeats.length === 2 && selectedBeats[0].id !== selectedBeats[1].id;
  const pairAlreadyConnected =
    canConnect &&
    connections.some(
      (c) =>
        (c.beatIdA === selectedBeats[0].id && c.beatIdB === selectedBeats[1].id) ||
        (c.beatIdA === selectedBeats[1].id && c.beatIdB === selectedBeats[0].id)
    );

  const handleAddBeat = () => {
    const id = addBeat();
    if (!id) {
      setMessage("Create a lane first.");
      return;
    }
    setMessage("Beat added.");
  };

  const handleConnect = () => {
    if (!canConnect) return;
    const result = toggleConnection(selectedBeats[0].id, selectedBeats[1].id);
    if (!result.connectionId) {
      setMessage("Could not connect those beats.");
      return;
    }
    setMessage(result.created ? "Crossing connected." : "Crossing removed.");
  };

  const zoomIndex = ZOOM_LANE_COUNT_STEPS.indexOf(
    ZOOM_LANE_COUNT_STEPS.includes(zoomLaneCount as (typeof ZOOM_LANE_COUNT_STEPS)[number])
      ? (zoomLaneCount as (typeof ZOOM_LANE_COUNT_STEPS)[number])
      : ZOOM_LANE_COUNT_STEPS[0]
  );

  const decreaseLaneCount = () => {
    const next = ZOOM_LANE_COUNT_STEPS[Math.max(zoomIndex - 1, 0)];
    setZoomLaneCount(next);
  };
  const increaseLaneCount = () => {
    const next = ZOOM_LANE_COUNT_STEPS[Math.min(zoomIndex + 1, ZOOM_LANE_COUNT_STEPS.length - 1)];
    setZoomLaneCount(next);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-dark-surface border-b border-dark-accent/50 flex-wrap">
      <Button variant="primary" size="sm" onClick={() => addLane()} title="New lane (parallel arc)">
        Lane
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={handleAddBeat}
        disabled={!canAddBeat}
        title={canAddBeat ? "New beat on selected lane" : "Select a lane or create one first"}
      >
        + Beat
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={handleConnect}
        disabled={!canConnect}
        title={
          canConnect
            ? pairAlreadyConnected
              ? "Remove the crossing between the two selected beats"
              : "Connect the two selected beats"
            : "Select exactly two beats (shift-click the second) to connect them"
        }
        className={!canConnect ? "opacity-50 cursor-not-allowed" : ""}
      >
        {canConnect && pairAlreadyConnected ? "Uncross" : "Crossing"}
      </Button>

      <div className="h-4 w-px bg-dark-accent/60 mx-1" />

      <div className="flex items-center gap-1" title="Visible lane count (zoom)">
        <button
          type="button"
          onClick={decreaseLaneCount}
          className="w-6 h-6 flex items-center justify-center rounded bg-dark-accent/50 hover:bg-dark-accent text-dark-muted hover:text-dark-text text-sm"
          title="Fewer, wider lanes"
        >
          −
        </button>
        <span className="text-xs text-dark-muted min-w-[3.5rem] text-center">
          {zoomLaneCount} lanes
        </span>
        <button
          type="button"
          onClick={increaseLaneCount}
          className="w-6 h-6 flex items-center justify-center rounded bg-dark-accent/50 hover:bg-dark-accent text-dark-muted hover:text-dark-text text-sm"
          title="More, narrower lanes"
        >
          +
        </button>
      </div>

      <div className="flex items-center gap-2" title="Beat block width as percentage of lane column">
        <span className="text-xs text-dark-muted whitespace-nowrap">Beat width: {beatWidthPercent}%</span>
        <input
          type="range"
          min={BEAT_WIDTH_PERCENT_MIN}
          max={BEAT_WIDTH_PERCENT_MAX}
          step={5}
          value={beatWidthPercent}
          onChange={(e) => setBeatWidthPercent(Number(e.target.value))}
          className="w-20 h-1 accent-blue-500 cursor-pointer"
        />
      </div>

      <div className="h-4 w-px bg-dark-accent/60 mx-1" />

      <Button
        variant="secondary"
        size="sm"
        onClick={() => setBeatsExpanded(!beatsExpanded)}
        title={beatsExpanded ? "Collapse beat blocks to compact height" : "Expand beat blocks to show descriptions"}
      >
        {beatsExpanded ? "Collapse beats" : "Expand beats"}
      </Button>

      {beatsExpanded && (
        <div className="flex items-center gap-2" title="Expanded beat block height">
          <span className="text-xs text-dark-muted whitespace-nowrap">Height: {expandedBeatHeightPx}px</span>
          <input
            type="range"
            min={EXPANDED_BEAT_HEIGHT_MIN}
            max={EXPANDED_BEAT_HEIGHT_MAX}
            step={10}
            value={expandedBeatHeightPx}
            onChange={(e) => setExpandedBeatHeightPx(Number(e.target.value))}
            className="w-20 h-1 accent-blue-500 cursor-pointer"
          />
        </div>
      )}

      {message && <span className="text-xs text-dark-muted ml-2">{message}</span>}
    </div>
  );
}
