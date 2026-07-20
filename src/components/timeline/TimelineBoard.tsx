import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConnectorOverlay from "./ConnectorOverlay";
import LaneColumn from "./LaneColumn";
import { useTimelineStore } from "../../store/timelineStore";
import { LANE_GATE_HEIGHT_PX, LANE_MIN_WIDTH_PX } from "../../store/timelineTypes";

interface TimelineBoardProps {
  onSelectForEdit?: () => void;
}

export default function TimelineBoard({ onSelectForEdit }: TimelineBoardProps) {
  const lanes = useTimelineStore((s) => s.lanes);
  const beats = useTimelineStore((s) => s.beats);
  const connections = useTimelineStore((s) => s.connections);
  const selection = useTimelineStore((s) => s.selection);
  const zoomLaneCount = useTimelineStore((s) => s.zoomLaneCount);
  const selectOnly = useTimelineStore((s) => s.selectOnly);
  const toggleSelection = useTimelineStore((s) => s.toggleSelection);
  const moveBeat = useTimelineStore((s) => s.moveBeat);

  const sortedLanes = useMemo(() => [...lanes].sort((a, b) => a.sortOrder - b.sortOrder), [lanes]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackContentRef = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [viewportWidth, setViewportWidth] = useState(0);
  const [layoutTick, setLayoutTick] = useState(0);
  const dragRafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      setViewportWidth(width);
    });
    ro.observe(el);
    setViewportWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const laneWidthPx = useMemo(() => {
    if (lanes.length === 0 || viewportWidth <= 0) return LANE_MIN_WIDTH_PX;
    const visibleCount = Math.min(zoomLaneCount, lanes.length);
    return Math.max(LANE_MIN_WIDTH_PX, viewportWidth / visibleCount);
  }, [lanes.length, viewportWidth, zoomLaneCount]);

  const totalContentWidth = Math.max(viewportWidth, laneWidthPx * lanes.length);

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
      set.add(c.beatIdA);
      set.add(c.beatIdB);
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
  }, [beats, lanes, laneWidthPx]);

  const bumpDragTick = useCallback(() => {
    if (dragRafRef.current != null) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      setLayoutTick((t) => t + 1);
    });
  }, []);

  const registerBeatRef = useCallback((beatId: string, el: HTMLElement | null) => {
    if (el) beatRefs.current.set(beatId, el);
    else beatRefs.current.delete(beatId);
  }, []);

  const getBeatElement = useCallback((beatId: string) => beatRefs.current.get(beatId) ?? null, []);

  const handleBeatClick = useCallback(
    (beatId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        toggleSelection({ type: "beat", id: beatId });
      } else {
        selectOnly({ type: "beat", id: beatId });
      }
      onSelectForEdit?.();
    },
    [toggleSelection, selectOnly, onSelectForEdit]
  );

  const handleLaneLabelClick = useCallback(
    (laneId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        toggleSelection({ type: "lane", id: laneId });
      } else {
        selectOnly({ type: "lane", id: laneId });
      }
      onSelectForEdit?.();
    },
    [toggleSelection, selectOnly, onSelectForEdit]
  );

  const handleSelectConnection = useCallback(
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
      if (!over) return;
      const beatId = String(active.id);
      const overData = over.data.current as { type?: string; laneId?: string } | undefined;

      let targetLaneId: string | null = null;
      let targetIndex = 0;

      if (overData?.type === "lane") {
        targetLaneId = overData.laneId ?? String(over.id);
        const laneBeats = beats
          .filter((b) => b.laneId === targetLaneId && b.id !== beatId)
          .sort((a, b) => a.order - b.order);
        targetIndex = laneBeats.length;
      } else if (overData?.type === "beat") {
        targetLaneId = overData.laneId ?? null;
        if (targetLaneId) {
          const laneBeats = beats
            .filter((b) => b.laneId === targetLaneId && b.id !== beatId)
            .sort((a, b) => a.order - b.order);
          const overIndex = laneBeats.findIndex((b) => b.id === over.id);
          targetIndex = overIndex >= 0 ? overIndex : laneBeats.length;
        }
      }

      if (!targetLaneId) return;
      moveBeat(beatId, targetLaneId, targetIndex);
    },
    [beats, moveBeat]
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
      onDragMove={bumpDragTick}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={viewportRef}
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
                  beats={beatsByLane.get(lane.id) ?? []}
                  selectedBeatIds={selectedBeatIds}
                  connectedBeatIds={connectedBeatIds}
                  onBeatClick={handleBeatClick}
                  registerBeatRef={registerBeatRef}
                />
              ))}
              <ConnectorOverlay
                containerRef={trackContentRef}
                getBeatElement={getBeatElement}
                connections={connections}
                selectedConnectionId={selectedConnectionId}
                onSelectConnection={handleSelectConnection}
                recomputeToken={layoutTick}
              />
            </div>
          </div>

          <div
            className="flex flex-shrink-0 border-t border-dark-accent bg-dark-surface"
            style={{ height: LANE_GATE_HEIGHT_PX }}
          >
            {sortedLanes.map((lane) => (
              <button
                key={lane.id}
                type="button"
                onClick={(e) => handleLaneLabelClick(lane.id, e)}
                style={{ width: laneWidthPx, flexBasis: laneWidthPx }}
                className={`flex flex-shrink-0 flex-col items-center justify-center gap-0.5 border-r border-dark-accent/30 px-2 text-center transition-colors ${
                  selectedLaneIds.has(lane.id)
                    ? "bg-blue-500/20 text-dark-text"
                    : "text-dark-muted hover:bg-dark-accent/20 hover:text-dark-text"
                }`}
                title={`${lane.label} — starting gate`}
              >
                <span className="truncate text-sm font-medium max-w-full">{lane.label}</span>
                <span className="text-[10px] uppercase text-dark-muted">{lane.laneType}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </DndContext>
  );
}
