import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TimelineBeat } from "../../store/timelineTypes";
import { useTimelineStore } from "../../store/timelineStore";
import { resolveBeatDate } from "../../utils/beatDate";
import { laneColorBeatBackground } from "../../utils/color";
import BeatDateEditor from "./BeatDateEditor";

const MAGNIFY_SCALE = 1.75;

interface MagnifiedBeatOverlayProps {
  beatId: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

export default function MagnifiedBeatOverlay({
  beatId,
  anchorRect,
  onClose,
}: MagnifiedBeatOverlayProps) {
  const beats = useTimelineStore((s) => s.beats);
  const lanes = useTimelineStore((s) => s.lanes);
  const updateBeat = useTimelineStore((s) => s.updateBeat);

  const beat = beats.find((b) => b.id === beatId);
  const lane = beat ? lanes.find((l) => l.id === beat.laneId) : undefined;

  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [detail, setDetail] = useState("");
  const [dateSpec, setDateSpec] = useState(beat?.dateSpec ?? { mode: "none" as const });

  useEffect(() => {
    if (!beat) return;
    setTitle(beat.title);
    setSynopsis(beat.synopsis);
    setDetail(beat.detail);
    setDateSpec(beat.dateSpec);
  }, [beat?.id, beat?.title, beat?.synopsis, beat?.detail, beat?.dateSpec]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!beat) return null;

  const laneBeats = beats.filter((b) => b.laneId === beat.laneId).sort((a, b) => a.slot - b.slot);
  const displayDate = resolveBeatDate(beat, beats);
  const isAnchor = beat.kind === "anchor";

  const width = anchorRect.width * MAGNIFY_SCALE;
  const height = anchorRect.height * MAGNIFY_SCALE;
  const left = anchorRect.left + anchorRect.width / 2 - width / 2;
  const top = anchorRect.top + anchorRect.height / 2 - height / 2;

  const commitFields = () => {
    const patch: Partial<Pick<TimelineBeat, "title" | "synopsis" | "detail" | "dateSpec">> = {};
    if (title !== beat.title) patch.title = title;
    if (synopsis !== beat.synopsis) patch.synopsis = synopsis;
    if (detail !== beat.detail) patch.detail = detail;
    if (JSON.stringify(dateSpec) !== JSON.stringify(beat.dateSpec)) patch.dateSpec = dateSpec;
    if (Object.keys(patch).length > 0) updateBeat(beat.id, patch);
  };

  const handleClose = () => {
    commitFields();
    onClose();
  };

  const bgStyle = lane?.color
    ? { backgroundColor: laneColorBeatBackground(lane.color), borderColor: lane.color }
    : undefined;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[60]"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        className={`fixed z-[61] rounded-lg border px-4 py-3 shadow-2xl ring-2 ring-blue-500/60 flex flex-col gap-4 overflow-y-auto ${
          isAnchor
            ? "border-violet-500/70 bg-[#231a33] text-dark-text"
            : "border-blue-500 bg-[#1e2a3a] text-dark-text"
        }`}
        style={{
          left,
          top,
          width,
          height,
          ...bgStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <label className="block space-y-1.5">
          <span className="text-xs text-dark-muted">Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitFields}
            className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm"
            autoFocus
          />
        </label>
        {displayDate && (
          <span className="text-xs text-dark-muted">{displayDate}</span>
        )}
        <label className="block space-y-1.5">
          <span className="text-xs text-dark-muted">Synopsis</span>
          <textarea
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            onBlur={commitFields}
            rows={3}
            className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm resize-none"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-dark-muted">Detail</span>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            onBlur={commitFields}
            rows={4}
            className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-dark-text text-sm resize-none"
          />
        </label>
        <BeatDateEditor
          beatId={beat.id}
          laneId={beat.laneId}
          dateSpec={dateSpec}
          laneBeats={laneBeats}
          allBeats={beats}
          onChange={(spec) => {
            setDateSpec(spec);
            updateBeat(beat.id, { dateSpec: spec });
          }}
        />
      </div>
    </>,
    document.body
  );
}
