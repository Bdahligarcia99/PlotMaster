import { useDroppable } from "@dnd-kit/core";
import BeatBlock from "./BeatBlock";
import { BEAT_COLLAPSED_HEIGHT_PX, BEAT_GAP_PX } from "../../store/timelineTypes";
import type { TimelineBeat } from "../../store/timelineTypes";

interface LaneColumnProps {
  laneId: string;
  laneColor?: string;
  width: number;
  /** Minimum height (px) for the lane's track — the visible viewport height. The column still
   * grows taller than this to fit its beats when there are more than fit on-screen. */
  minHeight: number;
  beats: TimelineBeat[];
  selectedBeatIds: Set<string>;
  connectedBeatIds: Set<string>;
  crossingColorByBeatId: Map<string, string>;
  beatWidthPercent: number;
  beatsExpanded: boolean;
  expandedBeatHeightPx: number;
  beatTextScalePercent: number;
  suppressHeightTransition?: boolean;
  onBeatClick: (beatId: string, e: React.MouseEvent) => void;
  onBeatDoubleClick: (beatId: string, e: React.MouseEvent) => void;
  onBeatWidthResizeStart: (beatId: string, e: React.PointerEvent) => void;
  onBeatHeightResizeStart: (beatId: string, e: React.PointerEvent) => void;
  registerBeatRef: (beatId: string, el: HTMLElement | null) => void;
  /** Ids of beats currently being dragged (single or group). */
  draggedBeatIds: Set<string>;
  /** Absolute slots where drop indicators should render in this lane. */
  dropTargetSlots: Set<number>;
}

/** Pixel height of a run of `missingSlots` consecutive unoccupied slots, rendered as a single
 * invisible spacer flanked by the normal flex `gap-2` on both sides — this is what gives every
 * lane its "invisible slot grid": gaps between beats are pure empty space, not beat objects. */
function spacerHeightPx(missingSlots: number, beatHeightPx: number): number {
  return missingSlots * beatHeightPx + Math.max(0, missingSlots - 1) * BEAT_GAP_PX;
}

type RenderItem =
  | { kind: "spacer"; heightPx: number; key: string }
  | { kind: "indicator"; key: string }
  | { kind: "beat"; beat: TimelineBeat; isSwapTarget: boolean };

/** A lane's "track": the droppable, vertically-stacking column of beat blocks. Slot 0 renders
 * nearest the bottom (the starting gate). Unoccupied slots between beats collapse into a single
 * invisible spacer sized to match exactly what real slots would take up, so two beats on the same
 * slot number in different lanes always land at the same height. */
export default function LaneColumn({
  laneId,
  laneColor,
  width,
  minHeight,
  beats,
  selectedBeatIds,
  connectedBeatIds,
  crossingColorByBeatId,
  beatWidthPercent,
  beatsExpanded,
  expandedBeatHeightPx,
  beatTextScalePercent,
  suppressHeightTransition = false,
  onBeatClick,
  onBeatDoubleClick,
  onBeatWidthResizeStart,
  onBeatHeightResizeStart,
  registerBeatRef,
  draggedBeatIds,
  dropTargetSlots,
}: LaneColumnProps) {
  const { setNodeRef } = useDroppable({ id: laneId, data: { type: "lane", laneId } });
  const beatHeightPx = beatsExpanded ? expandedBeatHeightPx : BEAT_COLLAPSED_HEIGHT_PX;
  const sorted = [...beats].sort((a, b) => a.slot - b.slot);
  const isDragging = draggedBeatIds.size > 0;
  const trackWidthPercent = beatWidthPercent / 2;

  const renderItems: RenderItem[] = [];
  let cursorSlot = 0;

  // Fill the gap between the last thing we placed (`cursorSlot`) and `upToSlot` (exclusive) — as
  // one plain spacer, or split around the drop indicator if it falls inside this gap.
  const flushGapUpTo = (upToSlot: number) => {
    const slotsInGap = dropTargetSlots;
    let slot = cursorSlot;
    while (slot < upToSlot) {
      const nextDrop = [...slotsInGap].sort((a, b) => a - b).find((s) => s >= slot && s < upToSlot);
      if (nextDrop != null && nextDrop >= slot) {
        const before = nextDrop - slot;
        if (before > 0) {
          renderItems.push({
            kind: "spacer",
            heightPx: spacerHeightPx(before, beatHeightPx),
            key: `sp-${slot}`,
          });
        }
        renderItems.push({ kind: "indicator", key: `ind-${nextDrop}` });
        slot = nextDrop + 1;
      } else {
        const missing = upToSlot - slot;
        if (missing > 0) {
          renderItems.push({
            kind: "spacer",
            heightPx: spacerHeightPx(missing, beatHeightPx),
            key: `sp-${slot}`,
          });
        }
        slot = upToSlot;
      }
    }
    cursorSlot = upToSlot;
  };

  for (const beat of sorted) {
    flushGapUpTo(beat.slot);
    renderItems.push({
      kind: "beat",
      beat,
      isSwapTarget: dropTargetSlots.has(beat.slot) && !draggedBeatIds.has(beat.id),
    });
    cursorSlot = beat.slot + 1;
  }
  const maxDropSlot = dropTargetSlots.size > 0 ? Math.max(...dropTargetSlots) : -1;
  if (maxDropSlot >= cursorSlot) {
    flushGapUpTo(maxDropSlot + 1);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ width, flexBasis: width, minHeight: minHeight > 0 ? minHeight : undefined }}
      className={`relative flex flex-shrink-0 flex-col-reverse items-center gap-2 px-2 py-2 border-r border-dark-accent/20 ${
        dropTargetSlots.size > 0 && isDragging ? "bg-blue-500/10" : ""
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

      {renderItems.map((item) => {
        if (item.kind === "spacer") {
          return (
            <div
              key={item.key}
              aria-hidden="true"
              className="flex-shrink-0 pointer-events-none"
              style={{ width: `${beatWidthPercent}%`, height: item.heightPx }}
            />
          );
        }
        if (item.kind === "indicator") {
          return (
            <div
              key={item.key}
              aria-hidden="true"
              className="flex-shrink-0 flex items-center justify-center"
              style={{ width: `${beatWidthPercent}%`, height: beatHeightPx }}
            >
              <div
                className="w-full rounded-full bg-blue-400 shadow-[0_0_8px_2px_rgba(96,165,250,0.6)]"
                style={{ height: 4 }}
              />
            </div>
          );
        }
        return (
          <BeatBlock
            key={item.beat.id}
            beat={item.beat}
            selected={selectedBeatIds.has(item.beat.id)}
            connected={connectedBeatIds.has(item.beat.id)}
            laneColor={laneColor}
            crossingColor={crossingColorByBeatId.get(item.beat.id)}
            highlightAsDropTarget={item.isSwapTarget}
            ghostInPlace={draggedBeatIds.has(item.beat.id)}
            beatWidthPercent={beatWidthPercent}
            beatsExpanded={beatsExpanded}
            expandedBeatHeightPx={expandedBeatHeightPx}
            beatTextScalePercent={beatTextScalePercent}
            suppressHeightTransition={suppressHeightTransition}
            onClick={(e) => onBeatClick(item.beat.id, e)}
            onDoubleClick={(e) => onBeatDoubleClick(item.beat.id, e)}
            onWidthResizeStart={(e) => onBeatWidthResizeStart(item.beat.id, e)}
            onHeightResizeStart={(e) => onBeatHeightResizeStart(item.beat.id, e)}
            registerRef={registerBeatRef}
          />
        );
      })}
    </div>
  );
}
