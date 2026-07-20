import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TimelineLane } from "../../store/timelineTypes";

export function laneGateSortableId(laneId: string): string {
  return `lane-gate:${laneId}`;
}

interface LaneGateCellProps {
  lane: TimelineLane;
  width: number;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
}

export default function LaneGateCell({ lane, width, selected, onClick, onDoubleClick }: LaneGateCellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: laneGateSortableId(lane.id),
    data: { type: "laneReorder", laneId: lane.id },
  });

  const style: React.CSSProperties = {
    width,
    flexBasis: width,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`flex flex-shrink-0 flex-col items-center justify-center gap-0.5 border-r border-dark-accent/30 px-2 text-center transition-colors cursor-grab active:cursor-grabbing select-none ${
        selected
          ? "bg-blue-500/20 text-dark-text"
          : "text-dark-muted hover:bg-dark-accent/20 hover:text-dark-text"
      }`}
      title={`${lane.label} — starting gate (drag to reorder)`}
    >
      <span className="truncate text-sm font-medium max-w-full">{lane.label}</span>
      <span className="text-[10px] uppercase text-dark-muted">{lane.laneType}</span>
    </button>
  );
}
