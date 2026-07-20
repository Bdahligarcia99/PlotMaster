import { useState, useEffect } from "react";
import Button from "../ui/Button";
import { useTimelineStore, ZOOM_LANE_COUNT_STEPS } from "../../store/timelineStore";

export default function TimelineToolbar() {
  const lanes = useTimelineStore((s) => s.lanes);
  const selection = useTimelineStore((s) => s.selection);
  const zoomLaneCount = useTimelineStore((s) => s.zoomLaneCount);
  const addLane = useTimelineStore((s) => s.addLane);
  const addBeat = useTimelineStore((s) => s.addBeat);
  const addConnection = useTimelineStore((s) => s.addConnection);
  const setZoomLaneCount = useTimelineStore((s) => s.setZoomLaneCount);
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
    const id = addConnection(selectedBeats[0].id, selectedBeats[1].id);
    setMessage(id ? "Crossing connected." : "Could not connect those beats.");
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
            ? "Connect the two selected beats"
            : "Select exactly two beats (shift-click the second) to connect them"
        }
        className={!canConnect ? "opacity-50 cursor-not-allowed" : ""}
      >
        Crossing
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

      {message && <span className="text-xs text-dark-muted ml-2">{message}</span>}
    </div>
  );
}
