import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BEAT_COLLAPSED_HEIGHT_PX, BEAT_HEIGHT_TRANSITION_MS } from "../../store/timelineTypes";
import type { TimelineBeat } from "../../store/timelineTypes";

interface BeatBlockProps {
  beat: TimelineBeat;
  selected: boolean;
  connected: boolean;
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
  beatWidthPercent,
  beatsExpanded,
  expandedBeatHeightPx,
  onClick,
  onDoubleClick,
  registerRef,
}: BeatBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: beat.id,
    data: { type: "beat", laneId: beat.laneId },
  });

  const heightPx = beatsExpanded ? expandedBeatHeightPx : BEAT_COLLAPSED_HEIGHT_PX;
  const heightTransition = `height ${BEAT_HEIGHT_TRANSITION_MS}ms ease`;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ? `${transition}, ${heightTransition}` : heightTransition,
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
        selected
          ? "border-blue-500 bg-blue-500/20 text-dark-text ring-1 ring-blue-500/60"
          : "border-dark-accent bg-dark-bg text-dark-text hover:border-dark-accent/80 hover:bg-dark-accent/20"
      }`}
    >
      <span className="block truncate font-medium">{beat.title || "Beat"}</span>
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
