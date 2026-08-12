import { useLayoutEffect, useState } from "react";
import type { TimelineBeat, TimelineConnection, TimelineLane } from "../../store/timelineTypes";
import { resolveCrossingBeatBackground } from "../../utils/color";

export interface CrossingBand {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
}

interface CrossingHighlightOverlayProps {
  connections: TimelineConnection[];
  beats: TimelineBeat[];
  sortedLanes: TimelineLane[];
  laneWidthPx: number;
  crossingColorByBeatId: Map<string, string>;
  laneColorById: Map<string, string | undefined>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  getBeatElement: (beatId: string) => HTMLElement | null;
  layoutTick: number;
}

function computeBands(
  connections: TimelineConnection[],
  beats: TimelineBeat[],
  sortedLanes: TimelineLane[],
  laneWidthPx: number,
  crossingColorByBeatId: Map<string, string>,
  laneColorById: Map<string, string | undefined>,
  trackRef: HTMLDivElement | null,
  getBeatElement: (beatId: string) => HTMLElement | null
): CrossingBand[] {
  if (!trackRef || laneWidthPx <= 0) return [];
  const trackRect = trackRef.getBoundingClientRect();
  const laneIndexById = new Map(sortedLanes.map((l, i) => [l.id, i]));
  const beatById = new Map(beats.map((b) => [b.id, b]));
  const bands: CrossingBand[] = [];

  for (const connection of connections) {
    if (connection.beatIds.length < 2) continue;

    const beatRects: { laneIndex: number; top: number; bottom: number; beatId: string }[] = [];
    for (const beatId of connection.beatIds) {
      const beat = beatById.get(beatId);
      const el = getBeatElement(beatId);
      if (!beat || !el) continue;
      const laneIndex = laneIndexById.get(beat.laneId);
      if (laneIndex === undefined) continue;
      const rect = el.getBoundingClientRect();
      beatRects.push({
        laneIndex,
        top: rect.top - trackRect.top,
        bottom: rect.bottom - trackRect.top,
        beatId,
      });
    }

    if (beatRects.length < 2) continue;

    const minLane = Math.min(...beatRects.map((r) => r.laneIndex));
    const maxLane = Math.max(...beatRects.map((r) => r.laneIndex));
    const top = Math.min(...beatRects.map((r) => r.top));
    const bottom = Math.max(...beatRects.map((r) => r.bottom));

    const explicitColor = connection.color?.trim() || crossingColorByBeatId.get(connection.beatIds[0]);
    const sampleLaneColor = laneColorById.get(
      sortedLanes[beatRects[0].laneIndex]?.id ?? ""
    );
    const color =
      explicitColor ||
      resolveCrossingBeatBackground(sampleLaneColor) ||
      resolveCrossingBeatBackground(undefined) ||
      "rgba(255,255,255,0.08)";

    bands.push({
      id: connection.id,
      left: minLane * laneWidthPx,
      top,
      width: (maxLane - minLane + 1) * laneWidthPx,
      height: Math.max(bottom - top, 1),
      color,
    });
  }

  return bands;
}

export default function CrossingHighlightOverlay({
  connections,
  beats,
  sortedLanes,
  laneWidthPx,
  crossingColorByBeatId,
  laneColorById,
  trackRef,
  getBeatElement,
  layoutTick,
}: CrossingHighlightOverlayProps) {
  const [bands, setBands] = useState<CrossingBand[]>([]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) {
      setBands([]);
      return;
    }
    setBands(
      computeBands(
        connections,
        beats,
        sortedLanes,
        laneWidthPx,
        crossingColorByBeatId,
        laneColorById,
        track,
        getBeatElement
      )
    );
  }, [
    connections,
    beats,
    sortedLanes,
    laneWidthPx,
    crossingColorByBeatId,
    laneColorById,
    trackRef,
    getBeatElement,
    layoutTick,
  ]);

  if (bands.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      {bands.map((band) => (
        <div
          key={band.id}
          className="absolute rounded-lg"
          style={{
            left: band.left,
            top: band.top,
            width: band.width,
            height: band.height,
            backgroundColor: band.color,
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}
