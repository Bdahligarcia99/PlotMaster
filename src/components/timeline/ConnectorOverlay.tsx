import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { TimelineConnection } from "../../store/timelineTypes";

interface ConnectorLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midX: number;
  midY: number;
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
 * SVG overlay drawing cross-lane crossing connectors as simple lines between beat blocks.
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
  const [lines, setLines] = useState<ConnectorLine[]>([]);

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const next: ConnectorLine[] = [];
    for (const conn of connections) {
      const elA = getBeatElement(conn.beatIdA);
      const elB = getBeatElement(conn.beatIdB);
      if (!elA || !elB) continue;
      const rectA = elA.getBoundingClientRect();
      const rectB = elB.getBoundingClientRect();
      const x1 = rectA.left + rectA.width / 2 - containerRect.left;
      const y1 = rectA.top + rectA.height / 2 - containerRect.top;
      const x2 = rectB.left + rectB.width / 2 - containerRect.left;
      const y2 = rectB.top + rectB.height / 2 - containerRect.top;
      next.push({ id: conn.id, x1, y1, x2, y2, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2 });
    }
    setLines(next);
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
      {lines.map((line) => {
        const selected = line.id === selectedConnectionId;
        return (
          <g key={line.id}>
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={selected ? "#f59e0b" : "#60a5fa"}
              strokeWidth={selected ? 2.5 : 1.5}
              strokeDasharray={selected ? undefined : "5 4"}
              opacity={0.85}
            />
            <circle
              cx={line.midX}
              cy={line.midY}
              r={7}
              fill={selected ? "#f59e0b" : "#1e293b"}
              stroke={selected ? "#f59e0b" : "#60a5fa"}
              strokeWidth={1.5}
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => onSelectConnection(line.id, e)}
              onDoubleClick={(e) => onOpenConnection(line.id, e)}
            />
          </g>
        );
      })}
    </svg>
  );
}
