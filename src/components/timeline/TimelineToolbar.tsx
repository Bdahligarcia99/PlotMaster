import { useState, useEffect } from "react";
import Button from "../ui/Button";
import { useTimelineStore } from "../../store/timelineStore";

export default function TimelineToolbar() {
  const lanes = useTimelineStore((s) => s.lanes);
  const addLane = useTimelineStore((s) => s.addLane);
  const addBeat = useTimelineStore((s) => s.addBeat);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const canAddBeat = lanes.length > 0;

  const handleAddBeat = () => {
    const id = addBeat();
    if (!id) {
      setMessage("Create a lane first.");
      return;
    }
    setMessage("Beat added.");
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
        disabled
        title="Crossing connectors — Phase 2"
        className="opacity-50 cursor-not-allowed"
      >
        Crossing
      </Button>

      {message && <span className="text-xs text-dark-muted ml-2">{message}</span>}
    </div>
  );
}
