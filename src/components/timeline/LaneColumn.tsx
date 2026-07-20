import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import BeatBlock from "./BeatBlock";
import type { TimelineBeat } from "../../store/timelineTypes";

interface LaneColumnProps {
  laneId: string;
  width: number;
  beats: TimelineBeat[];
  selectedBeatIds: Set<string>;
  connectedBeatIds: Set<string>;
  onBeatClick: (beatId: string, e: React.MouseEvent) => void;
  registerBeatRef: (beatId: string, el: HTMLElement | null) => void;
}

/** A lane's "track": the droppable, vertically-stacking column of beat blocks. Beat order 0 renders nearest the bottom (the starting gate). */
export default function LaneColumn({
  laneId,
  width,
  beats,
  selectedBeatIds,
  connectedBeatIds,
  onBeatClick,
  registerBeatRef,
}: LaneColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: laneId, data: { type: "lane", laneId } });
  const sorted = [...beats].sort((a, b) => a.order - b.order);
  const beatIds = sorted.map((b) => b.id);

  return (
    <div
      ref={setNodeRef}
      style={{ width, flexBasis: width }}
      className={`flex flex-shrink-0 flex-col-reverse items-stretch gap-2 px-2 py-2 border-r border-dark-accent/20 transition-colors ${
        isOver ? "bg-blue-500/10" : ""
      }`}
    >
      <SortableContext items={beatIds} strategy={verticalListSortingStrategy}>
        {sorted.map((beat) => (
          <BeatBlock
            key={beat.id}
            beat={beat}
            selected={selectedBeatIds.has(beat.id)}
            connected={connectedBeatIds.has(beat.id)}
            onClick={(e) => onBeatClick(beat.id, e)}
            registerRef={registerBeatRef}
          />
        ))}
      </SortableContext>
    </div>
  );
}
