import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  BEAT_COLLAPSED_HEIGHT_PX,
  BEAT_HEIGHT_TRANSITION_MS,
} from "../../store/timelineTypes";
import type { TimelineBeat } from "../../store/timelineTypes";
import { resolveBeatDate } from "../../utils/beatDate";
import { laneColorBeatBackground, resolveCrossingBeatBackground } from "../../utils/color";
import { useTimelineStore } from "../../store/timelineStore";

interface BeatBlockProps {
  beat: TimelineBeat;
  selected: boolean;
  connected: boolean;
  laneColor?: string;
  crossingColor?: string;
  /** True while another beat is being dragged and would land on (swap with) this beat if dropped
   * right now. */
  highlightAsDropTarget?: boolean;
  /** When true, beat stays in the slot grid but is invisible — the DragOverlay shows the moving copy. */
  ghostInPlace?: boolean;
  beatWidthPercent: number;
  beatsExpanded: boolean;
  expandedBeatHeightPx: number;
  beatTextScalePercent: number;
  suppressHeightTransition?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onWidthResizeStart: (e: React.PointerEvent) => void;
  onHeightResizeStart?: (e: React.PointerEvent) => void;
  registerRef: (beatId: string, el: HTMLElement | null) => void;
}

export default function BeatBlock({
  beat,
  selected,
  connected,
  laneColor,
  crossingColor,
  highlightAsDropTarget = false,
  ghostInPlace = false,
  beatWidthPercent,
  beatsExpanded,
  expandedBeatHeightPx,
  beatTextScalePercent,
  suppressHeightTransition = false,
  onClick,
  onDoubleClick,
  onWidthResizeStart,
  onHeightResizeStart,
  registerRef,
}: BeatBlockProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: beat.id,
    data: { type: "beat", laneId: beat.laneId },
  });

  const heightPx = beatsExpanded ? expandedBeatHeightPx : BEAT_COLLAPSED_HEIGHT_PX;
  const isAnchor = beat.kind === "anchor";
  const allBeats = useTimelineStore((s) => s.beats);
  const displayDate = resolveBeatDate(beat, allBeats);

  const textScale = beatTextScalePercent / 100;
  const titleFontSizePx = 14 * textScale;
  const detailFontSizePx = 10 * textScale;

  const style: React.CSSProperties = {
    transform: ghostInPlace ? undefined : CSS.Translate.toString(transform),
    transition:
      ghostInPlace || suppressHeightTransition
        ? undefined
        : `height ${BEAT_HEIGHT_TRANSITION_MS}ms ease`,
    visibility: ghostInPlace ? "hidden" : undefined,
    width: `${beatWidthPercent}%`,
    height: heightPx,
    overflowX: "hidden",
    overflowY: "auto",
    fontSize: titleFontSizePx,
    ...(connected
      ? {
          backgroundColor: resolveCrossingBeatBackground(laneColor, crossingColor),
          borderColor: selected ? undefined : crossingColor || laneColor,
        }
      : laneColor
        ? {
            backgroundColor: laneColorBeatBackground(laneColor),
            borderColor: selected ? undefined : laneColor,
          }
        : {}),
  };

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        registerRef(beat.id, el);
      }}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-beat-id={beat.id}
      className={`group relative flex-shrink-0 rounded-lg border px-3 py-2 text-left cursor-grab active:cursor-grabbing select-none ${
        laneColor
          ? selected
            ? "text-dark-text ring-1 ring-blue-500/60 border-blue-500"
            : "text-dark-text hover:brightness-110"
          : isAnchor
            ? selected
              ? "border-blue-500 bg-[#2a1f3d] text-dark-text ring-1 ring-blue-500/60"
              : "border-violet-500/70 bg-[#231a33] text-dark-text hover:border-violet-400 hover:bg-[#2a1f3d]"
            : selected
              ? "border-blue-500 bg-[#1e2a3a] text-dark-text ring-1 ring-blue-500/60"
              : "border-dark-accent bg-dark-bg text-dark-text hover:border-dark-accent hover:bg-dark-accent"
      } ${highlightAsDropTarget ? "ring-2 ring-blue-400 shadow-[0_0_10px_2px_rgba(96,165,250,0.5)]" : ""}`}
    >
      <span className="block truncate font-medium">
        {isAnchor && (
          <span className="mr-1 opacity-80" style={{ fontSize: detailFontSizePx }}>
            ⚓
          </span>
        )}
        {beat.title || (isAnchor ? "Anchor" : "Beat")}
      </span>
      {beatsExpanded ? (
        <>
          {displayDate && (
            <span className="block text-dark-muted mt-1" style={{ fontSize: detailFontSizePx }}>
              {displayDate}
            </span>
          )}
          {beat.synopsis.trim() && (
            <span
              className="block text-dark-muted mt-1 whitespace-pre-wrap break-words"
              style={{ fontSize: detailFontSizePx }}
            >
              {beat.synopsis}
            </span>
          )}
          {beat.detail.trim() && (
            <span
              className="block text-dark-muted mt-1 whitespace-pre-wrap break-words"
              style={{ fontSize: detailFontSizePx }}
            >
              {beat.detail}
            </span>
          )}
        </>
      ) : (
        displayDate && (
          <span
            className="block truncate text-dark-muted mt-0.5"
            style={{ fontSize: detailFontSizePx }}
          >
            {displayDate}
          </span>
        )
      )}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize beat width"
        onPointerDown={onWidthResizeStart}
        className="absolute top-0 right-0 h-full w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-blue-500/30 rounded-r-lg touch-none"
      />
      {beatsExpanded && onHeightResizeStart && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize beat height"
          onPointerDown={onHeightResizeStart}
          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-blue-500/30 rounded-t-lg touch-none"
        />
      )}
    </div>
  );
}
