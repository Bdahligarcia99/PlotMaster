import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { TimelineConnection } from "../../store/timelineTypes";

interface ConnectorHub {
  id: string;
  points: { x: number; y: number }[];
  centroidX: number;
  centroidY: number;
}

interface ConnectorOverlayProps {
  containerRef: React.RefObject<HTMLDivElement>;
  getBeatElement: (beatId: string) => HTMLElement | null;
  connections: TimelineConnection[];
  selectedConnectionId: string | null;
  onSelectConnection: (id: string, e: React.MouseEvent) => void;
  onOpenConnection: (id: string, e: React.MouseEvent) => void;
  recomputeToken: number;
}

/**
 * SVG overlay drawing cross-lane crossing connectors as star/hub lines from each beat to a centroid.
 * Lives as a normal-flow child inside the same scrolling content wrapper as the lane columns,
 * so offsets computed relative to that wrapper stay valid across scroll — no scroll-position
 * recomputation is needed, only on layout/content changes (resize, drag, reorder).
 */
export default function ConnectorOverlay({
  containerRef,
  getBeatElement,
  connections,
  selectedConnectionId,
  onSelectConnection,
  onOpenConnection,
  recomputeToken,
}: ConnectorOverlayProps) {
  const [hubs, setHubs] = useState<ConnectorHub[]>([]);

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const next: ConnectorHub[] = [];
    for (const conn of connections) {
      const points: { x: number; y: number }[] = [];
      for (const beatId of conn.beatIds) {
        const el = getBeatElement(beatId);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        points.push({
          x: rect.left + rect.width / 2 - containerRect.left,
          y: rect.top + rect.height / 2 - containerRect.top,
        });
      }
      if (points.length < 2) continue;
      const centroidX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const centroidY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      next.push({ id: conn.id, points, centroidX, centroidY });
    }
    setHubs(next);
  }, [connections, containerRef, getBeatElement]);

  useLayoutEffect(() => {
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recompute, recomputeToken]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(container);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [containerRef, recompute]);

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 5 }}>
      {hubs.map((hub) => {
        const selected = hub.id === selectedConnectionId;
        return (
          <g key={hub.id}>
            {hub.points.map((point, index) => (
              <line
                key={index}
                x1={point.x}
                y1={point.y}
                x2={hub.centroidX}
                y2={hub.centroidY}
                stroke={selected ? "#f59e0b" : "#60a5fa"}
                strokeWidth={selected ? 2.5 : 1.5}
                strokeDasharray={selected ? undefined : "5 4"}
                opacity={0.85}
              />
            ))}
            <circle
              cx={hub.centroidX}
              cy={hub.centroidY}
              r={7}
              fill={selected ? "#f59e0b" : "#1e293b"}
              stroke={selected ? "#f59e0b" : "#60a5fa"}
              strokeWidth={1.5}
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => onSelectConnection(hub.id, e)}
              onDoubleClick={(e) => onOpenConnection(hub.id, e)}
            />
          </g>
        );
      })}
    </svg>
  );
}
