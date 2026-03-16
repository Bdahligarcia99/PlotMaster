import { useState, useCallback, useEffect, useRef } from "react";
import { useStore, useReactFlow } from "reactflow";
import { useFamilyTreeStore } from "../../store/familyTreeStore";

const HANDLE_HEIGHT_PX = 10;
const MIN_ANCHOR_HEIGHT = 32;

type DragKind = "body" | "top" | "bottom";

/** Renders generation anchor bands (horizontal guidelines + tint) that move with canvas pan/zoom.
 * Bands are draggable vertically; top/bottom handles resize. */
export default function GenerationAnchorsOverlay() {
  const generationAnchors = useFamilyTreeStore((s) => s.generationAnchors);
  const showGenerationAnchors = useFamilyTreeStore((s) => s.showGenerationAnchors);
  const editingAnchorIds = useFamilyTreeStore((s) => s.editingAnchorIds);
  const viewportBounds = useFamilyTreeStore((s) => s.viewportBounds);
  const updateGenerationAnchorBounds = useFamilyTreeStore((s) => s.updateGenerationAnchorBounds);
  const { flowToScreenPosition, screenToFlowPosition } = useReactFlow();
  const domNode = useStore((s) => s.domNode);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<{
    anchorId: string;
    kind: DragKind;
    startClientY: number;
    startYTop: number;
    startHeight: number;
  } | null>(null);
  const rectRef = useRef<DOMRect | null>(null);

  const screenToFlowY = useCallback(
    (clientY: number) => {
      if (!domNode) return 0;
      const rect = domNode.getBoundingClientRect();
      const screenY = clientY - rect.top;
      const flow = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + screenY });
      return flow.y;
    },
    [domNode, screenToFlowPosition]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || !domNode) return;
      rectRef.current = domNode.getBoundingClientRect();
      const anchor = generationAnchors.find((a) => a.id === drag.anchorId);
      if (!anchor) return;

      const flowY = screenToFlowY(e.clientY);
      const deltaFlowY = flowY - screenToFlowY(drag.startClientY);

      if (drag.kind === "body") {
        const newYTop = drag.startYTop + deltaFlowY;
        updateGenerationAnchorBounds(drag.anchorId, { yTop: newYTop });
      } else if (drag.kind === "top") {
        const bottomY = drag.startYTop + drag.startHeight;
        let newYTop = drag.startYTop + deltaFlowY;
        let newHeight = bottomY - newYTop;
        if (newHeight < MIN_ANCHOR_HEIGHT) {
          newHeight = MIN_ANCHOR_HEIGHT;
          newYTop = bottomY - MIN_ANCHOR_HEIGHT;
        }
        updateGenerationAnchorBounds(drag.anchorId, { yTop: newYTop, height: newHeight });
      } else if (drag.kind === "bottom") {
        const topY = drag.startYTop;
        let newBottom = drag.startYTop + drag.startHeight + deltaFlowY;
        let newHeight = newBottom - topY;
        if (newHeight < MIN_ANCHOR_HEIGHT) {
          newHeight = MIN_ANCHOR_HEIGHT;
        }
        updateGenerationAnchorBounds(drag.anchorId, { height: newHeight });
      }
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [generationAnchors, screenToFlowY, updateGenerationAnchorBounds]);

  const handleMouseDown = useCallback(
    (anchorId: string, clientY: number, localY: number, topScreenY: number, bottomScreenY: number) => {
      const anchor = generationAnchors.find((a) => a.id === anchorId);
      if (!anchor) return;
      const bandHeight = bottomScreenY - topScreenY;
      let kind: DragKind = "body";
      if (bandHeight > HANDLE_HEIGHT_PX * 2) {
        if (localY < HANDLE_HEIGHT_PX) kind = "top";
        else if (localY > bandHeight - HANDLE_HEIGHT_PX) kind = "bottom";
      }
      dragRef.current = {
        anchorId,
        kind,
        startClientY: clientY,
        startYTop: anchor.yTop,
        startHeight: anchor.height,
      };
    },
    [generationAnchors]
  );

  if (!showGenerationAnchors || generationAnchors.length === 0 || !domNode || !viewportBounds) return null;

  const rect = domNode.getBoundingClientRect();
  rectRef.current = rect;
  const minX = viewportBounds.minX;
  const maxX = viewportBounds.maxX;

  const sorted = [...generationAnchors].sort((a, b) => a.index - b.index);

  const flowToScreenYInline = (flowY: number) => {
    const flow = { x: (minX + maxX) / 2, y: flowY };
    const screen = flowToScreenPosition(flow);
    return screen.y - rect.top;
  };

  const guidelineStyle = {
    backgroundColor: "rgba(59,130,246,0.35)",
    height: 2,
  };
  const bandTintStyle = {
    backgroundColor: "rgba(59,130,246,0.06)",
  };

  const isEditing = (anchorId: string) => editingAnchorIds.includes(anchorId);
  const showHandles = (anchorId: string) => isEditing(anchorId) && (hoveredId === anchorId || selectedId === anchorId);

  return (
    <div className="absolute inset-0 pointer-events-none z-[5]" aria-hidden>
      {/* Shared boundaries: 1 top line + N bottom lines = N+1 guidelines */}
      <div
        className="absolute left-0 right-0"
        style={{ top: flowToScreenYInline(sorted[0]!.yTop), ...guidelineStyle }}
      />
      {sorted.map((anchor) => {
        const bottomY = anchor.yTop + anchor.height;
        const topScreenY = flowToScreenYInline(anchor.yTop);
        const bottomScreenY = flowToScreenYInline(bottomY);
        const height = bottomScreenY - topScreenY;
        const handlesVisible = showHandles(anchor.id);
        const anchorEditing = isEditing(anchor.id);

        return (
          <div key={anchor.id}>
            <div
              className="absolute left-0 right-0"
              style={{ top: bottomScreenY, ...guidelineStyle }}
            />
            <div
              className="absolute left-0 right-0"
              style={{ top: topScreenY, height: Math.max(1, height), ...bandTintStyle }}
            />
            {/* Draggable hit area: only when editing; confirmed anchors pass input through to nodes */}
            {anchorEditing && (
            <div
              className="absolute left-0 right-0 pointer-events-auto cursor-move"
              style={{ top: topScreenY, height: Math.max(1, height) }}
              onMouseEnter={() => setHoveredId(anchor.id)}
              onMouseLeave={() => setHoveredId((prev) => (prev === anchor.id ? null : prev))}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId((prev) => (prev === anchor.id ? null : anchor.id));
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = domNode.getBoundingClientRect();
                const localY = e.clientY - rect.top - topScreenY;
                handleMouseDown(anchor.id, e.clientY, localY, topScreenY, bottomScreenY);
              }}
            >
              {handlesVisible && (
                <>
                  <div
                    className="absolute left-0 right-0 top-0 h-[10px] cursor-ns-resize flex items-center justify-center"
                    style={{ minHeight: Math.min(HANDLE_HEIGHT_PX, height / 2) }}
                    title="Drag to resize top"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleMouseDown(anchor.id, e.clientY, 0, topScreenY, bottomScreenY);
                    }}
                  >
                    <div className="absolute left-2 right-2 h-px bg-blue-400/40" />
                  </div>
                  <div
                    className="absolute left-0 right-0 bottom-0 h-[10px] cursor-ns-resize flex items-center justify-center"
                    style={{ minHeight: Math.min(HANDLE_HEIGHT_PX, height / 2) }}
                    title="Drag to resize bottom"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleMouseDown(anchor.id, e.clientY, height - 1, topScreenY, bottomScreenY);
                    }}
                  >
                    <div className="absolute left-2 right-2 h-px bg-blue-400/40" />
                  </div>
                </>
              )}
            </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
