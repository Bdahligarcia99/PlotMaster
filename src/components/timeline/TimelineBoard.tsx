import {
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConnectorOverlay from "./ConnectorOverlay";
import LaneColumn from "./LaneColumn";
import LaneGateCell, { laneGateSortableId } from "./LaneGateCell";
import { useTimelineStore } from "../../store/timelineStore";
import {
  BEAT_HEIGHT_TRANSITION_MS,
  LANE_GATE_HEIGHT_PX,
  LANE_MIN_WIDTH_PX,
  type TimelineBeat,
} from "../../store/timelineTypes";

interface TimelineBoardProps {
  onSelectForEdit?: () => void;
}

interface DragPreview {
  beatId: string;
  laneId: string;
  /** Index (within the destination lane's beats, sorted bottom-to-top, dragged beat excluded)
   * where the dragged beat would land if dropped right now. */
  index: number;
}

/**
 * Figure out where a dragged beat would land in `laneId` if dropped at `pointerY` (a viewport Y
 * coordinate). Compares against the *rendered* midpoints of the lane's other beats so that
 * dropping on open track space and dropping directly on a neighboring beat produce the same,
 * position-based result.
 */
function computeBeatDropIndex(
  pointerY: number,
  laneId: string,
  beats: TimelineBeat[],
  excludeBeatId: string,
  getBeatElement: (beatId: string) => HTMLElement | null
): number {
  const laneBeats = beats
    .filter((b) => b.laneId === laneId && b.id !== excludeBeatId)
    .sort((a, b) => a.order - b.order);

  let index = 0;
  for (let i = 0; i < laneBeats.length; i++) {
    const rect = getBeatElement(laneBeats[i].id)?.getBoundingClientRect();
    if (!rect) continue;
    const midY = rect.top + rect.height / 2;
    if (pointerY > midY) {
      // Pointer sits below this beat's midpoint — land here, pushing this beat (and everything
      // above it) up by one.
      index = i;
      break;
    }
    // Pointer sits above this beat's midpoint — keep looking further up the stack.
    index = i + 1;
  }
  return index;
}

/**
 * Which lane column a dragged beat is currently over, purely from its horizontal position.
 * Deliberately independent of dnd-kit's collision detection: `closestCenter` compares the
 * dragged item's rect against *every* registered droppable (every beat in every lane, plus each
 * lane's own big track rect), and once a lane's track fills the whole viewport height, its center
 * can end up numerically farther from the pointer than some unrelated droppable — which made
 * hovering over open track space (e.g. above the topmost beat) resolve to the wrong target, or
 * flicker between candidates. Picking the lane by straightforward horizontal math is unambiguous.
 */
function resolveLaneIndexFromX(pointerX: number, trackLeft: number, laneCount: number, laneWidthPx: number): number {
  if (laneCount <= 0 || laneWidthPx <= 0) return 0;
  const relativeX = pointerX - trackLeft;
  return Math.max(0, Math.min(laneCount - 1, Math.floor(relativeX / laneWidthPx)));
}

export default function TimelineBoard({ onSelectForEdit }: TimelineBoardProps) {
  const lanes = useTimelineStore((s) => s.lanes);
  const beats = useTimelineStore((s) => s.beats);
  const connections = useTimelineStore((s) => s.connections);
  const selection = useTimelineStore((s) => s.selection);
  const zoomLaneCount = useTimelineStore((s) => s.zoomLaneCount);
  const beatWidthPercent = useTimelineStore((s) => s.beatWidthPercent);
  const beatsExpanded = useTimelineStore((s) => s.beatsExpanded);
  const expandedBeatHeightPx = useTimelineStore((s) => s.expandedBeatHeightPx);
  const selectOnly = useTimelineStore((s) => s.selectOnly);
  const toggleSelection = useTimelineStore((s) => s.toggleSelection);
  const moveBeat = useTimelineStore((s) => s.moveBeat);
  const reorderLane = useTimelineStore((s) => s.reorderLane);

  const sortedLanes = useMemo(() => [...lanes].sort((a, b) => a.sortOrder - b.sortOrder), [lanes]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const viewportResizeObserverRef = useRef<ResizeObserver | null>(null);
  const trackContentRef = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [layoutTick, setLayoutTick] = useState(0);
  const dragRafRef = useRef<number | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const latestDragEventRef = useRef<{
    active: DragMoveEvent["active"];
    over: DragMoveEvent["over"];
  } | null>(null);

  // A callback ref (rather than a plain ref + mount-only effect) so the ResizeObserver gets
  // (re)attached whenever this node actually mounts — including when it first appears after the
  // "no lanes yet" placeholder branch is replaced by the real board on adding the first lane.
  const setViewportRef = useCallback((el: HTMLDivElement | null) => {
    viewportRef.current = el;
    viewportResizeObserverRef.current?.disconnect();
    viewportResizeObserverRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      setViewportWidth(rect?.width ?? el.clientWidth);
      setViewportHeight(rect?.height ?? el.clientHeight);
    });
    ro.observe(el);
    viewportResizeObserverRef.current = ro;
    setViewportWidth(el.clientWidth);
    setViewportHeight(el.clientHeight);
  }, []);

  useEffect(() => {
    return () => viewportResizeObserverRef.current?.disconnect();
  }, []);

  // Defensive fallback alongside the ResizeObserver above: some window-manager-driven size
  // changes (e.g. toggling OS-level fullscreen) can lag or get missed by ResizeObserver in a
  // webview. A plain window resize listener re-measures directly so the lane tracks can't get
  // stuck at a stale height/width.
  useEffect(() => {
    const remeasure = () => {
      const el = viewportRef.current;
      if (!el) return;
      setViewportWidth(el.clientWidth);
      setViewportHeight(el.clientHeight);
    };
    window.addEventListener("resize", remeasure);
    return () => window.removeEventListener("resize", remeasure);
  }, []);

  const laneWidthPx = useMemo(() => {
    if (lanes.length === 0 || viewportWidth <= 0) return LANE_MIN_WIDTH_PX;
    const visibleCount = Math.min(zoomLaneCount, lanes.length);
    return Math.max(LANE_MIN_WIDTH_PX, viewportWidth / visibleCount);
  }, [lanes.length, viewportWidth, zoomLaneCount]);

  const totalContentWidth = Math.max(viewportWidth, laneWidthPx * lanes.length);

  // How tall each lane's track should be at minimum — the scrollable lanes area's height (the
  // outer viewport minus the fixed-height gate row). Using min-height (not a hard height/stretch)
  // lets a lane's content still grow taller than the viewport and stay properly scrollable.
  const laneTrackMinHeightPx = Math.max(0, viewportHeight - LANE_GATE_HEIGHT_PX);

  const beatsByLane = useMemo(() => {
    const map = new Map<string, typeof beats>();
    for (const lane of sortedLanes) map.set(lane.id, []);
    for (const beat of beats) {
      const arr = map.get(beat.laneId);
      if (arr) arr.push(beat);
    }
    return map;
  }, [sortedLanes, beats]);

  const connectedBeatIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of connections) {
      for (const beatId of c.beatIds) {
        set.add(beatId);
      }
    }
    return set;
  }, [connections]);

  const selectedBeatIds = useMemo(
    () => new Set(selection.filter((s) => s.type === "beat").map((s) => s.id)),
    [selection]
  );
  const selectedLaneIds = useMemo(
    () => new Set(selection.filter((s) => s.type === "lane").map((s) => s.id)),
    [selection]
  );
  const selectedConnectionId = useMemo(() => {
    const item = selection.find((s) => s.type === "connection");
    return item?.id ?? null;
  }, [selection]);

  useEffect(() => {
    setLayoutTick((t) => t + 1);
  }, [beats, lanes, laneWidthPx, beatsExpanded, expandedBeatHeightPx]);

  useEffect(() => {
    let start: number | null = null;
    let rafId: number;

    const tick = (now: number) => {
      if (start === null) start = now;
      setLayoutTick((t) => t + 1);
      if (now - start < BEAT_HEIGHT_TRANSITION_MS + 50) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [beatsExpanded, expandedBeatHeightPx]);

  const registerBeatRef = useCallback((beatId: string, el: HTMLElement | null) => {
    if (el) beatRefs.current.set(beatId, el);
    else beatRefs.current.delete(beatId);
  }, []);

  const getBeatElement = useCallback((beatId: string) => beatRefs.current.get(beatId) ?? null, []);

  const recomputeDragPreview = useCallback(() => {
    const evt = latestDragEventRef.current;
    if (!evt) return;
    const { active } = evt;
    const activeData = active.data.current as { type?: string; laneId?: string } | undefined;
    const translated = active.rect.current.translated;
    if (activeData?.type !== "beat" || !translated || sortedLanes.length === 0) {
      setDragPreview(null);
      return;
    }
    const pointerX = translated.left + translated.width / 2;
    const pointerY = translated.top + translated.height / 2;
    const trackLeft = trackContentRef.current?.getBoundingClientRect().left ?? 0;
    const laneIndex = resolveLaneIndexFromX(pointerX, trackLeft, sortedLanes.length, laneWidthPx);
    const targetLaneId = sortedLanes[laneIndex].id;
    const beatId = String(active.id);
    const index = computeBeatDropIndex(pointerY, targetLaneId, beats, beatId, getBeatElement);
    setDragPreview({ beatId, laneId: targetLaneId, index });
  }, [beats, getBeatElement, sortedLanes, laneWidthPx]);

  const handleDragStart = useCallback((_event: DragStartEvent) => {
    latestDragEventRef.current = null;
    setDragPreview(null);
  }, []);

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      latestDragEventRef.current = { active: event.active, over: event.over };
      if (dragRafRef.current != null) return;
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null;
        setLayoutTick((t) => t + 1);
        recomputeDragPreview();
      });
    },
    [recomputeDragPreview]
  );

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    latestDragEventRef.current = null;
    setDragPreview(null);
  }, []);

  const handleBeatClick = useCallback(
    (beatId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        toggleSelection({ type: "beat", id: beatId });
      } else {
        selectOnly({ type: "beat", id: beatId });
      }
    },
    [toggleSelection, selectOnly]
  );

  const handleBeatDoubleClick = useCallback(
    (beatId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      selectOnly({ type: "beat", id: beatId });
      onSelectForEdit?.();
    },
    [selectOnly, onSelectForEdit]
  );

  const handleLaneLabelClick = useCallback(
    (laneId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        toggleSelection({ type: "lane", id: laneId });
      } else {
        selectOnly({ type: "lane", id: laneId });
      }
    },
    [toggleSelection, selectOnly]
  );

  const handleLaneLabelDoubleClick = useCallback(
    (laneId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      selectOnly({ type: "lane", id: laneId });
      onSelectForEdit?.();
    },
    [selectOnly, onSelectForEdit]
  );

  const handleSelectConnection = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      selectOnly({ type: "connection", id });
    },
    [selectOnly]
  );

  const handleOpenConnection = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      selectOnly({ type: "connection", id });
      onSelectForEdit?.();
    },
    [selectOnly, onSelectForEdit]
  );

  const handleBackgroundClick = useCallback(() => {
    selectOnly(null);
  }, [selectOnly]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      latestDragEventRef.current = null;
      setDragPreview(null);

      const activeData = active.data.current as { type?: string; laneId?: string } | undefined;

      if (activeData?.type === "laneReorder") {
        if (!over) return;
        const overData = over.data.current as { type?: string; laneId?: string } | undefined;
        if (overData?.type !== "laneReorder") return;
        const targetLaneId = overData.laneId;
        if (!targetLaneId) return;
        const targetIndex = sortedLanes.findIndex((lane) => lane.id === targetLaneId);
        if (targetIndex < 0) return;
        const sourceLaneId = activeData.laneId ?? String(active.id);
        reorderLane(sourceLaneId, targetIndex);
        return;
      }

      if (sortedLanes.length === 0) return;
      const beatId = String(active.id);

      // Resolve both the target lane and the in-lane index from the dragged item's own rendered
      // position (same approach as the live preview) instead of dnd-kit's collision-based `over`
      // — see resolveLaneIndexFromX for why that's more reliable, especially over open track space.
      // `over` is only consulted as a fallback in the rare case the active rect isn't available.
      const translated = active.rect.current.translated;
      let targetLaneId: string;
      let targetIndex: number;
      if (translated) {
        const pointerX = translated.left + translated.width / 2;
        const pointerY = translated.top + translated.height / 2;
        const trackLeft = trackContentRef.current?.getBoundingClientRect().left ?? 0;
        const laneIndex = resolveLaneIndexFromX(pointerX, trackLeft, sortedLanes.length, laneWidthPx);
        targetLaneId = sortedLanes[laneIndex].id;
        targetIndex = computeBeatDropIndex(pointerY, targetLaneId, beats, beatId, getBeatElement);
      } else {
        if (!over) return;
        const overData = over.data.current as { type?: string; laneId?: string } | undefined;
        const fallbackLaneId = overData?.laneId ?? (overData?.type === "lane" ? String(over.id) : null);
        if (!fallbackLaneId) return;
        targetLaneId = fallbackLaneId;
        targetIndex = beats.filter((b) => b.laneId === targetLaneId && b.id !== beatId).length;
      }

      moveBeat(beatId, targetLaneId, targetIndex);
    },
    [beats, moveBeat, reorderLane, sortedLanes, getBeatElement, laneWidthPx]
  );

  if (sortedLanes.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center bg-dark-bg/50">
        <p className="text-dark-muted text-sm">No lanes yet. Use Lane in the toolbar to start a track.</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        ref={setViewportRef}
        onClick={handleBackgroundClick}
        className="flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-hidden bg-dark-bg/50"
      >
        <div className="flex h-full flex-col" style={{ width: totalContentWidth, minWidth: totalContentWidth }}>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div
              ref={trackContentRef}
              className="relative flex min-h-full items-end"
              style={{ width: totalContentWidth }}
            >
              {sortedLanes.map((lane) => (
                <LaneColumn
                  key={lane.id}
                  laneId={lane.id}
                  width={laneWidthPx}
                  minHeight={laneTrackMinHeightPx}
                  beats={beatsByLane.get(lane.id) ?? []}
                  selectedBeatIds={selectedBeatIds}
                  connectedBeatIds={connectedBeatIds}
                  beatWidthPercent={beatWidthPercent}
                  beatsExpanded={beatsExpanded}
                  expandedBeatHeightPx={expandedBeatHeightPx}
                  onBeatClick={handleBeatClick}
                  onBeatDoubleClick={handleBeatDoubleClick}
                  registerBeatRef={registerBeatRef}
                  draggedBeatId={dragPreview?.beatId ?? null}
                  dropIndicatorIndex={dragPreview?.laneId === lane.id ? dragPreview.index : null}
                />
              ))}
              <ConnectorOverlay
                containerRef={trackContentRef}
                getBeatElement={getBeatElement}
                connections={connections}
                selectedConnectionId={selectedConnectionId}
                onSelectConnection={handleSelectConnection}
                onOpenConnection={handleOpenConnection}
                recomputeToken={layoutTick}
              />
            </div>
          </div>

          <SortableContext
            items={sortedLanes.map((lane) => laneGateSortableId(lane.id))}
            strategy={horizontalListSortingStrategy}
          >
            <div
              className="flex flex-shrink-0 border-t border-dark-accent bg-dark-surface"
              style={{ height: LANE_GATE_HEIGHT_PX }}
            >
              {sortedLanes.map((lane) => (
                <LaneGateCell
                  key={lane.id}
                  lane={lane}
                  width={laneWidthPx}
                  selected={selectedLaneIds.has(lane.id)}
                  onClick={(e) => handleLaneLabelClick(lane.id, e)}
                  onDoubleClick={(e) => handleLaneLabelDoubleClick(lane.id, e)}
                />
              ))}
            </div>
          </SortableContext>
        </div>
      </div>
    </DndContext>
  );
}
