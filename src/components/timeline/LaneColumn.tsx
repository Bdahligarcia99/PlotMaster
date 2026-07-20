import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import BeatBlock from "./BeatBlock";
import type { TimelineBeat } from "../../store/timelineTypes";

interface LaneColumnProps {
  laneId: string;
  width: number;
  /** Minimum height (px) for the lane's track — the visible viewport height. The column still
   * grows taller than this to fit its beats when there are more than fit on-screen. */
  minHeight: number;
  beats: TimelineBeat[];
  selectedBeatIds: Set<string>;
  connectedBeatIds: Set<string>;
  beatWidthPercent: number;
  beatsExpanded: boolean;
  expandedBeatHeightPx: number;
  onBeatClick: (beatId: string, e: React.MouseEvent) => void;
  onBeatDoubleClick: (beatId: string, e: React.MouseEvent) => void;
  registerBeatRef: (beatId: string, el: HTMLElement | null) => void;
}

/** A lane's "track": the droppable, vertically-stacking column of beat blocks. Beat order 0 renders nearest the bottom (the starting gate). */
export default function LaneColumn({
  laneId,
  width,
  minHeight,
  beats,
  selectedBeatIds,
  connectedBeatIds,
  beatWidthPercent,
  beatsExpanded,
  expandedBeatHeightPx,
  onBeatClick,
  onBeatDoubleClick,
  registerBeatRef,
}: LaneColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: laneId, data: { type: "lane", laneId } });
  const sorted = [...beats].sort((a, b) => a.order - b.order);
  const beatIds = sorted.map((b) => b.id);

  const trackWidthPercent = beatWidthPercent / 2;

  return (
    <div
      ref={setNodeRef}
      style={{ width, flexBasis: width, minHeight: minHeight > 0 ? minHeight : undefined }}
      className={`relative flex flex-shrink-0 flex-col-reverse items-center gap-2 px-2 py-2 border-r border-dark-accent/20 transition-colors ${
        isOver ? "bg-blue-500/10" : ""
      }`}
    >
      {/* Lane track: a darker rail down the center so each lane reads as a distinct column, even
          in the empty space above the topmost beat. Width tracks the beat-width slider. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-2xl bg-black/25"
        style={{ width: `${trackWidthPercent}%` }}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/15" />
      </div>

      <SortableContext items={beatIds} strategy={verticalListSortingStrategy}>
        {sorted.map((beat) => (
          <BeatBlock
            key={beat.id}
            beat={beat}
            selected={selectedBeatIds.has(beat.id)}
            connected={connectedBeatIds.has(beat.id)}
            beatWidthPercent={beatWidthPercent}
            beatsExpanded={beatsExpanded}
            expandedBeatHeightPx={expandedBeatHeightPx}
            onClick={(e) => onBeatClick(beat.id, e)}
            onDoubleClick={(e) => onBeatDoubleClick(beat.id, e)}
            registerRef={registerBeatRef}
          />
        ))}
      </SortableContext>
    </div>
  );
}
