import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { BEAT_COLLAPSED_HEIGHT_PX, BEAT_HEIGHT_TRANSITION_MS } from "../../store/timelineTypes";
import type { TimelineBeat } from "../../store/timelineTypes";

interface BeatBlockProps {
  beat: TimelineBeat;
  selected: boolean;
  connected: boolean;
  /** True while another beat is being dragged and would land on (swap with) this beat if dropped
   * right now. */
  highlightAsDropTarget?: boolean;
  beatWidthPercent: number;
  beatsExpanded: boolean;
  expandedBeatHeightPx: number;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  registerRef: (beatId: string, el: HTMLElement | null) => void;
}

export default function BeatBlock({
  beat,
  selected,
  connected,
  highlightAsDropTarget = false,
  beatWidthPercent,
  beatsExpanded,
  expandedBeatHeightPx,
  onClick,
  onDoubleClick,
  registerRef,
}: BeatBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: beat.id,
    data: { type: "beat", laneId: beat.laneId },
  });

  const heightPx = beatsExpanded ? expandedBeatHeightPx : BEAT_COLLAPSED_HEIGHT_PX;
  const isAnchor = beat.kind === "anchor";

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: `height ${BEAT_HEIGHT_TRANSITION_MS}ms ease`,
    opacity: isDragging ? 0.4 : 1,
    width: `${beatWidthPercent}%`,
    height: heightPx,
    overflowX: "hidden",
    overflowY: "auto",
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
      className={`group relative flex-shrink-0 rounded-lg border px-3 py-2 text-left text-sm cursor-grab active:cursor-grabbing select-none transition-colors ${
        isAnchor
          ? selected
            ? "border-blue-500 bg-violet-500/15 text-dark-text ring-1 ring-blue-500/60"
            : "border-violet-500/70 bg-violet-500/10 text-dark-text hover:border-violet-500/90 hover:bg-violet-500/15"
          : selected
            ? "border-blue-500 bg-blue-500/20 text-dark-text ring-1 ring-blue-500/60"
            : "border-dark-accent bg-dark-bg text-dark-text hover:border-dark-accent/80 hover:bg-dark-accent/20"
      } ${highlightAsDropTarget ? "ring-2 ring-blue-400 shadow-[0_0_10px_2px_rgba(96,165,250,0.5)]" : ""}`}
    >
      <span className="block truncate font-medium">
        {isAnchor && <span className="mr-1 text-[10px] opacity-80">⚓</span>}
        {beat.title || (isAnchor ? "Anchor" : "Beat")}
      </span>
      {beatsExpanded ? (
        <>
          {beat.date.trim() && (
            <span className="block text-[10px] text-dark-muted mt-1">{beat.date}</span>
          )}
          {beat.description.trim() && (
            <span className="block text-[10px] text-dark-muted mt-1 whitespace-pre-wrap break-words">
              {beat.description}
            </span>
          )}
        </>
      ) : (
        beat.date.trim() && (
          <span className="block truncate text-[10px] text-dark-muted mt-0.5">{beat.date}</span>
        )
      )}
      {connected && (
        <span
          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-dark-bg"
          title="Connected to another beat"
        />
      )}
    </div>
  );
}
