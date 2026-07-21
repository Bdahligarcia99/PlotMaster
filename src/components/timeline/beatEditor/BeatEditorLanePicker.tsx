import { useTimelineStore } from "../../../store/timelineStore";

interface BeatEditorLanePickerProps {
  laneId: string | null;
  onLaneChange: (laneId: string) => void;
}

export default function BeatEditorLanePicker({ laneId, onLaneChange }: BeatEditorLanePickerProps) {
  const lanes = useTimelineStore((s) => s.lanes);
  const addLane = useTimelineStore((s) => s.addLane);
  const sorted = [...lanes].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-dark-muted whitespace-nowrap">Target lane:</label>
      <select
        value={laneId ?? ""}
        onChange={(e) => {
          if (e.target.value === "__new__") {
            const id = addLane();
            onLaneChange(id);
          } else if (e.target.value) {
            onLaneChange(e.target.value);
          }
        }}
        className="px-2 py-1 rounded bg-dark-bg border border-dark-accent text-sm text-dark-text min-w-[140px]"
      >
        <option value="" disabled>
          Select lane…
        </option>
        {sorted.map((lane) => (
          <option key={lane.id} value={lane.id}>
            {lane.label}
          </option>
        ))}
        <option value="__new__">+ New lane…</option>
      </select>
    </div>
  );
}
