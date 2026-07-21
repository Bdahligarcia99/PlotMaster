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
  /** Id of the beat currently being dragged (anywhere on the board), if any. */
  draggedBeatId: string | null;
  /** Index — among this lane's beats sorted bottom-to-top, excluding the dragged beat — where a
   * "drop here" indicator should render. Only set for the lane currently under the pointer. */
  dropIndicatorIndex: number | null;
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
  draggedBeatId,
  dropIndicatorIndex,
}: LaneColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: laneId, data: { type: "lane", laneId } });
  const sorted = [...beats].sort((a, b) => a.order - b.order);
  const beatIds = sorted.map((b) => b.id);

  const trackWidthPercent = beatWidthPercent / 2;

  // Walk the real (unfiltered) beat list, but track a parallel index that only counts beats
  // other than the one being dragged — that's the index space `dropIndicatorIndex` is expressed
  // in (it mirrors the store's eventual splice position). Insert the indicator marker whenever
  // that reference index matches, so it lands in the right gap regardless of whether the dragged
  // beat currently sits in this lane.
  const renderItems: Array<{ kind: "indicator" } | { kind: "beat"; beat: TimelineBeat }> = [];
  if (dropIndicatorIndex != null) {
    let refIndex = 0;
    for (const beat of sorted) {
      if (dropIndicatorIndex === refIndex) renderItems.push({ kind: "indicator" });
      renderItems.push({ kind: "beat", beat });
      if (beat.id !== draggedBeatId) refIndex += 1;
    }
    if (dropIndicatorIndex === refIndex) renderItems.push({ kind: "indicator" });
  } else {
    for (const beat of sorted) renderItems.push({ kind: "beat", beat });
  }

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
        {renderItems.map((item, i) =>
          item.kind === "indicator" ? (
            <div
              key={`drop-indicator-${i}`}
              aria-hidden="true"
              className="flex-shrink-0 rounded-full bg-blue-400 shadow-[0_0_8px_2px_rgba(96,165,250,0.6)]"
              style={{ width: `${beatWidthPercent}%`, height: 4 }}
            />
          ) : (
            <BeatBlock
              key={item.beat.id}
              beat={item.beat}
              selected={selectedBeatIds.has(item.beat.id)}
              connected={connectedBeatIds.has(item.beat.id)}
              beatWidthPercent={beatWidthPercent}
              beatsExpanded={beatsExpanded}
              expandedBeatHeightPx={expandedBeatHeightPx}
              onClick={(e) => onBeatClick(item.beat.id, e)}
              onDoubleClick={(e) => onBeatDoubleClick(item.beat.id, e)}
              registerRef={registerBeatRef}
            />
          )
        )}
      </SortableContext>
    </div>
  );
}
