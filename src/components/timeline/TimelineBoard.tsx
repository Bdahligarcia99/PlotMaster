import {
  DndContext,
  DragOverlay,
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
import { flushSync } from "react-dom";
import LaneColumn from "./LaneColumn";
import LaneGateCell, { laneGateSortableId } from "./LaneGateCell";
import BeatBlock from "./BeatBlock";
import MagnifiedBeatOverlay from "./MagnifiedBeatOverlay";
import CrossingHighlightOverlay from "./CrossingHighlightOverlay";
import { computeSlotTrackContentHeightPx, getPrimarySelection, useTimelineStore } from "../../store/timelineStore";
import {
  filterBeatsByScope,
  filterConnectionsForActiveFolder,
  filterLanesByScope,
  getScopedLaneIds,
} from "../../store/timelineFolderHelpers";
import type { TimelineBeat, TimelineLane } from "../../store/timelineTypes";
import {
  BEAT_COLLAPSED_HEIGHT_PX,
  BEAT_GAP_PX,
  BEAT_HEIGHT_TRANSITION_MS,
  BEAT_WIDTH_PERCENT_MAX,
  BEAT_WIDTH_PERCENT_MIN,
  EXPANDED_BEAT_HEIGHT_MAX,
  EXPANDED_BEAT_HEIGHT_MIN,
  LANE_GATE_HEIGHT_PX,
  LANE_MIN_WIDTH_PX,
  LANE_TRACK_PADDING_PX,
} from "../../store/timelineTypes";

interface TimelineBoardProps {
  onSelectForEdit?: () => void;
  inspectorOpen?: boolean;
  inspectorWidth?: number;
  scriptPaneOpen?: boolean;
}

interface DragPreview {
  beatId: string;
  laneId: string;
  /** Absolute slot on the shared slot grid the dragged beat would land on if dropped right now. */
  slot: number;
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

/**
 * The board's slot grid is pure arithmetic, not neighbor geometry: slot 0 sits flush against the
 * bottom of the track (`containerBottomInner`), and every slot above it is exactly one
 * beat-height-plus-gap higher. That makes every lane's grid line up with every other lane's at
 * the same slot number, and means dropping into empty track space resolves exactly the same way
 * as dropping next to an existing beat — there's no "nearest neighbor" ambiguity to flicker on.
 */
function computeSlotFromY(
  pointerY: number,
  containerBottomInner: number,
  beatHeightPx: number,
  gapPx: number
): number {
  const slotStepPx = beatHeightPx + gapPx;
  if (slotStepPx <= 0) return 0;
  const raw = (containerBottomInner - beatHeightPx / 2 - pointerY) / slotStepPx;
  return Math.max(0, Math.round(raw));
}

function computeGroupDragPreviews(
  beats: TimelineBeat[],
  sortedLanes: TimelineLane[],
  draggedBeatId: string,
  targetLaneId: string,
  targetSlot: number,
  selectedBeatIds: Set<string>
): DragPreview[] {
  const draggedBeat = beats.find((b) => b.id === draggedBeatId);
  if (!draggedBeat) return [];

  const isGroup = selectedBeatIds.has(draggedBeatId) && selectedBeatIds.size > 1;
  if (!isGroup) {
    return [{ beatId: draggedBeatId, laneId: targetLaneId, slot: targetSlot }];
  }

  const sourceLaneIndex = sortedLanes.findIndex((l) => l.id === draggedBeat.laneId);
  const targetLaneIndex = sortedLanes.findIndex((l) => l.id === targetLaneId);
  const laneIndexDelta = targetLaneIndex - sourceLaneIndex;
  const slotDelta = targetSlot - draggedBeat.slot;

  const previews: DragPreview[] = [];
  for (const id of selectedBeatIds) {
    const beat = beats.find((b) => b.id === id);
    if (!beat) continue;
    const laneIndex = sortedLanes.findIndex((l) => l.id === beat.laneId);
    const newLaneIndex = Math.max(
      0,
      Math.min(sortedLanes.length - 1, laneIndex + laneIndexDelta)
    );
    previews.push({
      beatId: id,
      laneId: sortedLanes[newLaneIndex].id,
      slot: Math.max(0, beat.slot + slotDelta),
    });
  }
  return previews;
}

export default function TimelineBoard({
  onSelectForEdit,
  inspectorOpen = false,
  inspectorWidth = 0,
  scriptPaneOpen = true,
}: TimelineBoardProps) {
  const allLanes = useTimelineStore((s) => s.lanes);
  const allBeats = useTimelineStore((s) => s.beats);
  const allConnections = useTimelineStore((s) => s.connections);
  const documents = useTimelineStore((s) => s.documents);
  const folders = useTimelineStore((s) => s.folders);
  const activeFolderId = useTimelineStore((s) => s.activeFolderId);
  const selection = useTimelineStore((s) => s.selection);
  const zoomLaneCount = useTimelineStore((s) => s.zoomLaneCount);
  const beatWidthPercent = useTimelineStore((s) => s.beatWidthPercent);
  const beatTextScalePercent = useTimelineStore((s) => s.beatTextScalePercent);
  const beatsExpanded = useTimelineStore((s) => s.beatsExpanded);
  const expandedBeatHeightPx = useTimelineStore((s) => s.expandedBeatHeightPx);
  const magnifyToolActive = useTimelineStore((s) => s.magnifyToolActive);
  const magnifiedBeatId = useTimelineStore((s) => s.magnifiedBeatId);
  const horizontalSelectToolActive = useTimelineStore((s) => s.horizontalSelectToolActive);
  const setBeatWidthPercent = useTimelineStore((s) => s.setBeatWidthPercent);
  const setExpandedBeatHeightPx = useTimelineStore((s) => s.setExpandedBeatHeightPx);
  const setMagnifiedBeatId = useTimelineStore((s) => s.setMagnifiedBeatId);
  const setMagnifyToolActive = useTimelineStore((s) => s.setMagnifyToolActive);
  const setHorizontalSelectToolActive = useTimelineStore((s) => s.setHorizontalSelectToolActive);
  const setSelection = useTimelineStore((s) => s.setSelection);
  const selectOnly = useTimelineStore((s) => s.selectOnly);
  const toggleSelection = useTimelineStore((s) => s.toggleSelection);
  const moveBeat = useTimelineStore((s) => s.moveBeat);
  const moveBeatsGroup = useTimelineStore((s) => s.moveBeatsGroup);
  const reorderLane = useTimelineStore((s) => s.reorderLane);

  const scopedLaneIds = useMemo(
    () => getScopedLaneIds(documents, folders, activeFolderId),
    [documents, folders, activeFolderId]
  );

  const lanes = useMemo(
    () => filterLanesByScope(allLanes, scopedLaneIds),
    [allLanes, scopedLaneIds]
  );
  const beats = useMemo(
    () => filterBeatsByScope(allBeats, scopedLaneIds),
    [allBeats, scopedLaneIds]
  );
  const connections = useMemo(
    () => filterConnectionsForActiveFolder(allConnections, allBeats, scopedLaneIds),
    [allConnections, allBeats, scopedLaneIds]
  );

  const sortedLanes = useMemo(() => [...lanes].sort((a, b) => a.sortOrder - b.sortOrder), [lanes]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const verticalScrollRef = useRef<HTMLDivElement | null>(null);
  const viewportResizeObserverRef = useRef<ResizeObserver | null>(null);
  const trackContentRef = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [layoutTick, setLayoutTick] = useState(0);
  const dragRafRef = useRef<number | null>(null);
  const [dragPreviews, setDragPreviews] = useState<DragPreview[]>([]);
  const [activeDragBeatId, setActiveDragBeatId] = useState<string | null>(null);
  const [isResizingBeatHeight, setIsResizingBeatHeight] = useState(false);
  const [magnifiedAnchorRect, setMagnifiedAnchorRect] = useState<DOMRect | null>(null);
  // Tracks how far the user is scrolled from the bottom of the lane track (updated live on
  // scroll). Beats stack upward from the bottom (flex-col-reverse), so when expanding/collapsing
  // beat height changes the track's total scroll height, this lets us hold the viewport's
  // position relative to the bottom steady instead of visually "jumping" as the content grows.
  const distanceFromBottomRef = useRef(0);
  const scrollFixInitializedRef = useRef(false);
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

  // Re-measure when Inspector opens/closes or is resized — paddingRight changes the content box
  // and some browsers batch/miss the contentRect ResizeObserver callback.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    setViewportWidth(el.clientWidth);
    setViewportHeight(el.clientHeight);
  }, [inspectorOpen, inspectorWidth, scriptPaneOpen]);

  const inspectorScrollPaddingPx = inspectorOpen ? inspectorWidth + 8 : 0;

  const laneWidthPx = useMemo(() => {
    if (lanes.length === 0 || viewportWidth <= 0) return LANE_MIN_WIDTH_PX;
    const visibleCount = Math.min(zoomLaneCount, lanes.length);
    return Math.max(LANE_MIN_WIDTH_PX, viewportWidth / visibleCount);
  }, [lanes.length, viewportWidth, zoomLaneCount]);

  // When every lane fits the (already padding-shrunk) content box, inner width equals
  // viewportWidth and paddingRight alone yields zero max scrollLeft. Add inspector-width
  // extra track width while the overlay is open so any lane can scroll clear of it.
  const totalContentWidth =
    Math.max(viewportWidth, laneWidthPx * lanes.length) + inspectorScrollPaddingPx;

  const beatHeightPx = beatsExpanded ? expandedBeatHeightPx : BEAT_COLLAPSED_HEIGHT_PX;

  // How tall each lane's track should be at minimum: at least the viewport's own height (the
  // outer viewport minus the fixed-height gate row), and always tall enough to show every
  // occupied slot on the board (not just this lane's own beats — slots are shared/global, so a
  // lane with nothing in it still needs to reach as high as the tallest beat elsewhere) plus a
  // little headroom. Using min-height (not a hard height/stretch) lets a lane's content still
  // grow taller than the viewport and stay properly scrollable.
  const laneTrackMinHeightPx = Math.max(
    viewportHeight - LANE_GATE_HEIGHT_PX,
    computeSlotTrackContentHeightPx(beats, beatHeightPx)
  );

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

  const crossingColorByBeatId = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of connections) {
      const color = c.color?.trim();
      if (!color) continue;
      for (const beatId of c.beatIds) {
        if (!map.has(beatId)) map.set(beatId, color);
      }
    }
    return map;
  }, [connections]);

  const laneColorById = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const lane of sortedLanes) {
      map.set(lane.id, lane.color);
    }
    return map;
  }, [sortedLanes]);

  const selectedBeatIds = useMemo(
    () => new Set(selection.filter((s) => s.type === "beat").map((s) => s.id)),
    [selection]
  );

  useEffect(() => {
    const primary = getPrimarySelection(selection);
    if (primary?.type !== "beat") return;
    const el = beatRefs.current.get(primary.id);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selection]);

  const draggedBeatIds = useMemo(() => {
    if (dragPreviews.length > 0) return new Set(dragPreviews.map((p) => p.beatId));
    if (activeDragBeatId) return new Set([activeDragBeatId]);
    return new Set<string>();
  }, [dragPreviews, activeDragBeatId]);

  const dropTargetsByLane = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const preview of dragPreviews) {
      if (!map.has(preview.laneId)) map.set(preview.laneId, new Set());
      map.get(preview.laneId)!.add(preview.slot);
    }
    return map;
  }, [dragPreviews]);
  const selectedLaneIds = useMemo(
    () => new Set(selection.filter((s) => s.type === "lane").map((s) => s.id)),
    [selection]
  );
  useEffect(() => {
    setLayoutTick((t) => t + 1);
  }, [beats, lanes, laneWidthPx, beatsExpanded, expandedBeatHeightPx]);

  useEffect(() => {
    // Skip on the very first run (mount) — there's nothing to anchor yet, and we don't want to
    // force a scroll on initial load.
    const skipScrollFix = !scrollFixInitializedRef.current;
    scrollFixInitializedRef.current = true;

    let start: number | null = null;
    let rafId: number;

    const tick = (now: number) => {
      if (start === null) start = now;
      setLayoutTick((t) => t + 1);
      if (!skipScrollFix) {
        const el = verticalScrollRef.current;
        if (el) {
          const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
          el.scrollTop = Math.max(0, Math.min(maxScroll, maxScroll - distanceFromBottomRef.current));
          distanceFromBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight;
        }
      }
      if (now - start < BEAT_HEIGHT_TRANSITION_MS + 50) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [beatsExpanded, expandedBeatHeightPx]);

  const handleVerticalScroll = useCallback(() => {
    const el = verticalScrollRef.current;
    if (!el) return;
    distanceFromBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight;
    setLayoutTick((t) => t + 1);
  }, []);

  const registerBeatRef = useCallback((beatId: string, el: HTMLElement | null) => {
    if (el) beatRefs.current.set(beatId, el);
    else beatRefs.current.delete(beatId);
  }, []);

  const getBeatElement = useCallback((beatId: string) => beatRefs.current.get(beatId) ?? null, []);

  const handleBeatWidthResizeStart = useCallback(
    (beatId: string, e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startPercent = beatWidthPercent;
      const lanePx = Math.max(laneWidthPx, 1);

      const onMove = (ev: PointerEvent) => {
        const deltaPercent = ((ev.clientX - startX) / lanePx) * 100;
        const next = Math.min(
          BEAT_WIDTH_PERCENT_MAX,
          Math.max(BEAT_WIDTH_PERCENT_MIN, startPercent + deltaPercent)
        );
        const el = getBeatElement(beatId);
        const beforeRect = el?.getBoundingClientRect();
        flushSync(() => setBeatWidthPercent(next));
        if (beforeRect && el) {
          const afterRect = el.getBoundingClientRect();
          const deltaLeft = afterRect.left - beforeRect.left;
          const viewport = viewportRef.current;
          if (viewport && deltaLeft !== 0) {
            viewport.scrollLeft += deltaLeft;
          }
        }
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [beatWidthPercent, laneWidthPx, getBeatElement, setBeatWidthPercent]
  );

  const handleBeatHeightResizeStart = useCallback(
    (beatId: string, e: React.PointerEvent) => {
      if (!beatsExpanded) return;
      e.stopPropagation();
      e.preventDefault();
      setIsResizingBeatHeight(true);
      const startY = e.clientY;
      const startHeight = expandedBeatHeightPx;

      const onMove = (ev: PointerEvent) => {
        const deltaY = ev.clientY - startY;
        const next = Math.round(
          Math.min(
            EXPANDED_BEAT_HEIGHT_MAX,
            Math.max(EXPANDED_BEAT_HEIGHT_MIN, startHeight - deltaY)
          )
        );
        const el = getBeatElement(beatId);
        const beforeRect = el?.getBoundingClientRect();
        flushSync(() => setExpandedBeatHeightPx(next));
        if (beforeRect && el) {
          const afterRect = el.getBoundingClientRect();
          const deltaTop = afterRect.top - beforeRect.top;
          const vScroll = verticalScrollRef.current;
          if (vScroll && deltaTop !== 0) {
            vScroll.scrollTop += deltaTop;
            distanceFromBottomRef.current =
              vScroll.scrollHeight - vScroll.scrollTop - vScroll.clientHeight;
          }
        }
      };

      const onUp = () => {
        setIsResizingBeatHeight(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [beatsExpanded, expandedBeatHeightPx, getBeatElement, setExpandedBeatHeightPx]
  );

  /** Resolve the target lane + slot for a beat drag purely from the dragged item's own rendered
   * rect — shared by the live preview and the final drop so they always agree. */
  const resolveDragTarget = useCallback(
    (
      active: DragMoveEvent["active"]
    ): { beatId: string; targetLaneId: string; targetSlot: number } | null => {
      const translated = active.rect.current.translated;
      if (!translated || sortedLanes.length === 0) return null;
      const pointerX = translated.left + translated.width / 2;
      const pointerY = translated.top + translated.height / 2;
      const trackRect = trackContentRef.current?.getBoundingClientRect();
      const trackLeft = trackRect?.left ?? 0;
      const containerBottomInner = (trackRect?.bottom ?? 0) - LANE_TRACK_PADDING_PX;
      const laneIndex = resolveLaneIndexFromX(pointerX, trackLeft, sortedLanes.length, laneWidthPx);
      const targetLaneId = sortedLanes[laneIndex].id;
      const targetSlot = computeSlotFromY(pointerY, containerBottomInner, beatHeightPx, BEAT_GAP_PX);
      return { beatId: String(active.id), targetLaneId, targetSlot };
    },
    [sortedLanes, laneWidthPx, beatHeightPx]
  );

  const recomputeDragPreview = useCallback(() => {
    const evt = latestDragEventRef.current;
    if (!evt) return;
    const { active } = evt;
    const activeData = active.data.current as { type?: string; laneId?: string } | undefined;
    if (activeData?.type !== "beat") {
      setDragPreviews([]);
      return;
    }
    const target = resolveDragTarget(active);
    if (!target) {
      setDragPreviews([]);
      return;
    }
    setDragPreviews(
      computeGroupDragPreviews(
        beats,
        sortedLanes,
        target.beatId,
        target.targetLaneId,
        target.targetSlot,
        selectedBeatIds
      )
    );
  }, [resolveDragTarget, beats, sortedLanes, selectedBeatIds]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    latestDragEventRef.current = null;
    setDragPreviews([]);
    const data = event.active.data.current as { type?: string } | undefined;
    if (data?.type === "beat") {
      setActiveDragBeatId(String(event.active.id));
    }
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
    setDragPreviews([]);
    setActiveDragBeatId(null);
  }, []);

  const handleBeatClick = useCallback(
    (beatId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (horizontalSelectToolActive) {
        const clickedBeat = beats.find((b) => b.id === beatId);
        if (clickedBeat) {
          setSelection(
            beats
              .filter((b) => b.slot === clickedBeat.slot)
              .map((b) => ({ type: "beat" as const, id: b.id }))
          );
        }
        return;
      }
      if (magnifyToolActive) {
        setMagnifiedBeatId(beatId);
        const el = getBeatElement(beatId);
        if (el) setMagnifiedAnchorRect(el.getBoundingClientRect());
        selectOnly({ type: "beat", id: beatId });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        toggleSelection({ type: "beat", id: beatId });
      } else {
        selectOnly({ type: "beat", id: beatId });
      }
    },
    [
      toggleSelection,
      selectOnly,
      magnifyToolActive,
      horizontalSelectToolActive,
      setMagnifiedBeatId,
      getBeatElement,
      beats,
      setSelection,
    ]
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

  const handleBackgroundClick = useCallback(() => {
    if (magnifiedBeatId) {
      setMagnifiedBeatId(null);
      setMagnifiedAnchorRect(null);
    }
    selectOnly(null);
  }, [selectOnly, magnifiedBeatId, setMagnifiedBeatId]);

  useEffect(() => {
    if (!magnifiedBeatId) {
      setMagnifiedAnchorRect(null);
      return;
    }
    const el = getBeatElement(magnifiedBeatId);
    if (el) setMagnifiedAnchorRect(el.getBoundingClientRect());
  }, [magnifiedBeatId, getBeatElement, layoutTick]);

  useEffect(() => {
    if (!magnifyToolActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMagnifiedBeatId(null);
        setMagnifiedAnchorRect(null);
        setMagnifyToolActive(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [magnifyToolActive, setMagnifiedBeatId, setMagnifyToolActive]);

  useEffect(() => {
    if (!horizontalSelectToolActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHorizontalSelectToolActive(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [horizontalSelectToolActive, setHorizontalSelectToolActive]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onScroll = () => setLayoutTick((t) => t + 1);
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, []);

  const handleViewportWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = viewportRef.current;
    if (!el) return;
    const absX = Math.abs(e.deltaX);
    const absY = Math.abs(e.deltaY);
    const horizontalIntent = absX > absY || e.shiftKey;
    if (!horizontalIntent) return;
    e.preventDefault();
    el.scrollLeft += e.deltaX + (e.shiftKey ? e.deltaY : 0);
  }, []);

  const activeDragBeat = useMemo(
    () => (activeDragBeatId ? beats.find((b) => b.id === activeDragBeatId) ?? null : null),
    [activeDragBeatId, beats]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      latestDragEventRef.current = null;
      setDragPreviews([]);
      setActiveDragBeatId(null);

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

      // Resolve both the target lane and the target slot from the dragged item's own rendered
      // position (same approach as the live preview) instead of dnd-kit's collision-based `over`
      // — see resolveLaneIndexFromX for why that's more reliable, especially over open track
      // space. `over` is only consulted as a fallback in the rare case the active rect isn't
      // available.
      const target = resolveDragTarget(active);
      if (target) {
        const previews = computeGroupDragPreviews(
          beats,
          sortedLanes,
          target.beatId,
          target.targetLaneId,
          target.targetSlot,
          selectedBeatIds
        );
        const isGroup = selectedBeatIds.has(target.beatId) && selectedBeatIds.size > 1;
        if (isGroup) {
          moveBeatsGroup(
            previews.map((p) => ({ beatId: p.beatId, laneId: p.laneId, slot: p.slot }))
          );
        } else {
          moveBeat(target.beatId, target.targetLaneId, target.targetSlot);
        }
        return;
      }

      if (!over) return;
      const overData = over.data.current as { type?: string; laneId?: string } | undefined;
      const fallbackLaneId = overData?.laneId ?? (overData?.type === "lane" ? String(over.id) : null);
      if (!fallbackLaneId) return;
      const beatId = String(active.id);
      const laneBeats = beats.filter((b) => b.laneId === fallbackLaneId && b.id !== beatId);
      const fallbackSlot = laneBeats.length === 0 ? 0 : Math.max(...laneBeats.map((b) => b.slot)) + 1;
      moveBeat(beatId, fallbackLaneId, fallbackSlot);
    },
    [beats, moveBeat, moveBeatsGroup, reorderLane, sortedLanes, resolveDragTarget, selectedBeatIds]
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
        onWheel={handleViewportWheel}
        className="flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-hidden bg-dark-bg/50"
        style={{
          paddingRight: inspectorOpen ? inspectorScrollPaddingPx : undefined,
          scrollPaddingRight: inspectorOpen ? inspectorScrollPaddingPx : undefined,
          overflowAnchor: "none",
        }}
      >
        <div className="flex h-full flex-col" style={{ width: totalContentWidth, minWidth: totalContentWidth }}>
          <div
            ref={verticalScrollRef}
            onScroll={handleVerticalScroll}
            className="flex-1 min-h-0 overflow-y-auto overscroll-x-contain"
            style={{ overflowAnchor: "none" }}
          >
            <div
              ref={trackContentRef}
              className="relative flex min-h-full items-stretch"
              style={{ width: totalContentWidth }}
            >
              <CrossingHighlightOverlay
                connections={connections}
                beats={beats}
                sortedLanes={sortedLanes}
                laneWidthPx={laneWidthPx}
                crossingColorByBeatId={crossingColorByBeatId}
                laneColorById={laneColorById}
                trackRef={trackContentRef}
                getBeatElement={getBeatElement}
                layoutTick={layoutTick}
              />
              {sortedLanes.map((lane) => (
                <LaneColumn
                  key={lane.id}
                  laneId={lane.id}
                  laneColor={lane.color}
                  width={laneWidthPx}
                  minHeight={laneTrackMinHeightPx}
                  beats={beatsByLane.get(lane.id) ?? []}
                  selectedBeatIds={selectedBeatIds}
                  connectedBeatIds={connectedBeatIds}
                  crossingColorByBeatId={crossingColorByBeatId}
                  beatWidthPercent={beatWidthPercent}
                  beatsExpanded={beatsExpanded}
                  expandedBeatHeightPx={expandedBeatHeightPx}
                  beatTextScalePercent={beatTextScalePercent}
                  suppressHeightTransition={isResizingBeatHeight}
                  onBeatClick={handleBeatClick}
                  onBeatDoubleClick={handleBeatDoubleClick}
                  onBeatWidthResizeStart={handleBeatWidthResizeStart}
                  onBeatHeightResizeStart={handleBeatHeightResizeStart}
                  registerBeatRef={registerBeatRef}
                  draggedBeatIds={draggedBeatIds}
                  dropTargetSlots={dropTargetsByLane.get(lane.id) ?? new Set()}
                />
              ))}
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
      <DragOverlay dropAnimation={null}>
        {activeDragBeat ? (
          <BeatBlock
            beat={activeDragBeat}
            selected={selectedBeatIds.has(activeDragBeat.id)}
            connected={connectedBeatIds.has(activeDragBeat.id)}
            laneColor={sortedLanes.find((l) => l.id === activeDragBeat.laneId)?.color}
            crossingColor={crossingColorByBeatId.get(activeDragBeat.id)}
            beatWidthPercent={beatWidthPercent}
            beatsExpanded={beatsExpanded}
            expandedBeatHeightPx={expandedBeatHeightPx}
            beatTextScalePercent={beatTextScalePercent}
            onClick={() => {}}
            onDoubleClick={() => {}}
            onWidthResizeStart={() => {}}
            registerRef={() => {}}
          />
        ) : null}
      </DragOverlay>
      {magnifiedBeatId && magnifiedAnchorRect && (
        <MagnifiedBeatOverlay
          beatId={magnifiedBeatId}
          anchorRect={magnifiedAnchorRect}
          onClose={() => {
            setMagnifiedBeatId(null);
            setMagnifiedAnchorRect(null);
          }}
        />
      )}
    </DndContext>
  );
}
