import { arrayMove } from "@dnd-kit/sortable";
import { create } from "zustand";
import {
  getStorageDriver,
  isTimelineProjectPayload,
  type TimelineBeatRecord,
  type TimelineConnectionRecord,
  type TimelineOrientation,
  type TimelineProjectPayload,
} from "../storage/StorageDriver";
import { generateTimelineId } from "../storage/timelineIds";
import { generateTimelineScript, parseTimelineScript } from "./timelineScript";
import {
  ANCHOR_GHOST_COUNT_MAX,
  ANCHOR_GHOST_COUNT_MIN,
  BEAT_WIDTH_PERCENT_MAX,
  BEAT_WIDTH_PERCENT_MIN,
  DEFAULT_ANCHOR_GHOSTS_ABOVE,
  DEFAULT_ANCHOR_GHOSTS_BELOW,
  DEFAULT_BEAT_WIDTH_PERCENT,
  DEFAULT_EXPANDED_BEAT_HEIGHT_PX,
  DEFAULT_ZOOM_LANE_COUNT,
  EXPANDED_BEAT_HEIGHT_MAX,
  EXPANDED_BEAT_HEIGHT_MIN,
  getDefaultAnchorTitle,
  getDefaultBeatTitle,
  getDefaultLaneLabel,
  type TimelineBeat,
  type TimelineConnection,
  type TimelineLane,
  type TimelineSelectionItem,
} from "./timelineTypes";

const SAVE_DEBOUNCE_MS = 500;

export type { TimelineOrientation, TimelineLane, TimelineBeat, TimelineConnection, TimelineSelectionItem };
export { generateTimelineScript, parseTimelineScript, lineReferencesTimelineEntity } from "./timelineScript";
export {
  LANE_TYPE_PRESETS,
  ZOOM_LANE_COUNT_STEPS,
  DEFAULT_ZOOM_LANE_COUNT,
  LANE_MIN_WIDTH_PX,
  LANE_GATE_HEIGHT_PX,
  DEFAULT_BEAT_WIDTH_PERCENT,
  BEAT_WIDTH_PERCENT_MIN,
  BEAT_WIDTH_PERCENT_MAX,
  BEAT_COLLAPSED_HEIGHT_PX,
  DEFAULT_EXPANDED_BEAT_HEIGHT_PX,
  EXPANDED_BEAT_HEIGHT_MIN,
  EXPANDED_BEAT_HEIGHT_MAX,
  BEAT_HEIGHT_TRANSITION_MS,
  ANCHOR_GHOST_COUNT_MIN,
  ANCHOR_GHOST_COUNT_MAX,
  DEFAULT_ANCHOR_GHOSTS_ABOVE,
  DEFAULT_ANCHOR_GHOSTS_BELOW,
  getZoomLaneCountSteps,
  snapZoomLaneCount,
} from "./timelineTypes";

export function createDefaultTimelinePayload(): TimelineProjectPayload {
  return {
    version: 1,
    moduleType: "timeline",
    timelineOrientation: "vertical",
    lanes: [],
    beats: [],
    connections: [],
  };
}

export function resolveLaneIdFromSelection(
  lanes: TimelineLane[],
  beats: TimelineBeat[],
  selection: TimelineSelectionItem[]
): string | null {
  const primary = selection[0];
  if (!primary) return lanes[0]?.id ?? null;
  if (primary.type === "lane") return primary.id;
  if (primary.type === "beat") {
    const beat = beats.find((b) => b.id === primary.id);
    if (beat) return beat.laneId;
  }
  return lanes[0]?.id ?? null;
}

function renormalizeLaneOrders(beats: TimelineBeat[], laneId: string): TimelineBeat[] {
  const laneBeats = beats
    .filter((b) => b.laneId === laneId)
    .sort((a, b) => a.order - b.order)
    .map((beat, index) => ({ ...beat, order: index }));
  const laneBeatIds = new Set(laneBeats.map((b) => b.id));
  return [...beats.filter((b) => !laneBeatIds.has(b.id)), ...laneBeats];
}

/**
 * Replace laneId's entire beat set with `sequence` (the complete desired bottom-to-top order —
 * omit any beat that should be deleted), renumbering order 0..n-1. Beats in other lanes are untouched.
 * IMPORTANT: this drops ALL of the lane's existing beats unconditionally, not just the ones present
 * in `sequence` — that's what makes deletions (e.g. shrinking a ghost run) actually take effect.
 */
function applyLaneSequence(beats: TimelineBeat[], laneId: string, sequence: TimelineBeat[]): TimelineBeat[] {
  const renumbered = sequence.map((b, i) => ({ ...b, order: i }));
  return [...beats.filter((b) => b.laneId !== laneId), ...renumbered];
}

function createGhostBeat(laneId: string, anchorId: string, ghostSide: "above" | "below"): TimelineBeat {
  return {
    id: generateTimelineId(),
    laneId,
    order: 0,
    kind: "empty",
    title: "",
    description: "",
    date: "",
    anchorId,
    ghostSide,
  };
}

function findAnchorGroupStartIndex(seq: TimelineBeat[], anchorIndex: number): number {
  const anchor = seq[anchorIndex];
  let start = anchorIndex;
  while (start > 0) {
    const prev = seq[start - 1];
    if (prev.kind === "empty" && prev.anchorId === anchor.id && prev.ghostSide === "below") {
      start--;
    } else {
      break;
    }
  }
  return start;
}

/** Build a new story beat and splice it into `seq` immediately before `anchorId`'s whole protected
 * group (its below-ghosts too), or append it to the end of `seq` if `anchorId` is null/not found. */
function spliceStoryBeatBeforeAnchor(
  seq: TimelineBeat[],
  laneId: string,
  anchorId: string | null
): TimelineBeat {
  const beat: TimelineBeat = {
    id: generateTimelineId(),
    laneId,
    order: 0,
    kind: "story",
    title: getDefaultBeatTitle(seq),
    description: "",
    date: "",
  };
  const anchorIndex = anchorId ? seq.findIndex((b) => b.id === anchorId) : -1;
  if (anchorIndex < 0) {
    seq.push(beat);
  } else {
    seq.splice(findAnchorGroupStartIndex(seq, anchorIndex), 0, beat);
  }
  return beat;
}

type StoredConnection = TimelineConnectionRecord & {
  beatIdA?: string;
  beatIdB?: string;
};

function normalizeLoadedBeat(beat: TimelineBeatRecord): TimelineBeat {
  const kind =
    beat.kind === "empty" ? "empty" : beat.kind === "anchor" ? "anchor" : "story";
  return {
    id: beat.id,
    laneId: beat.laneId,
    order: beat.order,
    kind,
    title: beat.title,
    description: beat.description,
    date: beat.date,
    ...(beat.anchorId ? { anchorId: beat.anchorId } : {}),
    ...(beat.ghostSide ? { ghostSide: beat.ghostSide } : {}),
  };
}

function normalizeLoadedConnection(connection: StoredConnection): TimelineConnection {
  if (connection.beatIds && connection.beatIds.length >= 2) {
    return {
      id: connection.id,
      beatIds: connection.beatIds,
      title: connection.title ?? "",
      description: connection.description ?? "",
      date: connection.date ?? "",
    };
  }
  if (connection.beatIdA && connection.beatIdB) {
    return {
      id: connection.id,
      beatIds: [connection.beatIdA, connection.beatIdB],
      title: connection.title ?? "",
      description: connection.description ?? "",
      date: connection.date ?? "",
    };
  }
  return {
    id: connection.id,
    beatIds: connection.beatIds ?? [],
    title: connection.title ?? "",
    description: connection.description ?? "",
    date: connection.date ?? "",
  };
}

export function canFormCrossing(
  beatIds: string[],
  beats: TimelineBeat[]
): { ok: boolean; reason?: "fewer-than-2" | "not-found" | "same-lane" | "empty-beat" } {
  const deduped = [...new Set(beatIds)];
  if (deduped.length < 2) return { ok: false, reason: "fewer-than-2" };

  const beatMap = new Map(beats.map((b) => [b.id, b]));
  const laneIds: string[] = [];
  for (const id of deduped) {
    const beat = beatMap.get(id);
    if (!beat) return { ok: false, reason: "not-found" };
    if (beat.kind === "empty") return { ok: false, reason: "empty-beat" };
    laneIds.push(beat.laneId);
  }
  if (new Set(laneIds).size !== laneIds.length) return { ok: false, reason: "same-lane" };
  return { ok: true };
}

export function connectionMatchesBeatSet(connection: TimelineConnection, beatIds: string[]): boolean {
  const a = [...new Set(connection.beatIds)];
  const b = [...new Set(beatIds)];
  if (a.length !== b.length || a.length < 2) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

interface TimelineStore {
  activeProjectId: string | null;
  timelineOrientation: TimelineOrientation;
  lanes: TimelineLane[];
  beats: TimelineBeat[];
  connections: TimelineConnection[];
  selection: TimelineSelectionItem[];
  zoomLaneCount: number;
  beatWidthPercent: number;
  beatsExpanded: boolean;
  expandedBeatHeightPx: number;
  beatPlacementMode: "auto" | "above" | "below";
  requireAnchorSelection: boolean;
  scriptPanelLayout: "split" | "codeOnly" | "viewOnly";
  scriptDraft: string | null;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  lastSaveError: string | null;
  autosaveEnabled: boolean;
  loadTimeline: (projectId: string) => Promise<{ hadData: boolean }>;
  saveTimeline: () => Promise<boolean>;
  flushSaveAndSave: () => Promise<boolean>;
  setTimelineOrientation: (orientation: TimelineOrientation) => void;
  setScriptPanelLayout: (layout: "split" | "codeOnly" | "viewOnly") => void;
  setZoomLaneCount: (count: number) => void;
  setBeatWidthPercent: (percent: number) => void;
  setBeatsExpanded: (expanded: boolean) => void;
  setExpandedBeatHeightPx: (px: number) => void;
  setBeatPlacementMode: (mode: "auto" | "above" | "below") => void;
  setRequireAnchorSelection: (enabled: boolean) => void;
  setSelection: (
    items: TimelineSelectionItem[] | ((prev: TimelineSelectionItem[]) => TimelineSelectionItem[])
  ) => void;
  selectOnly: (item: TimelineSelectionItem | null) => void;
  toggleSelection: (item: TimelineSelectionItem) => void;
  addLane: () => string;
  addBeat: (laneId?: string, kind?: "story" | "empty") => string | null;
  addAnchorBeat: (
    laneId?: string,
    ghostsAbove?: number,
    ghostsBelow?: number
  ) => string | null;
  addStoryBeatBeforeFirstAnchor: (laneId?: string) => string | null;
  addStoryBeatBeforeAnchor: (anchorId: string) => string | null;
  insertStoryBeatRelativeToBeat: (beatId: string, position: "above" | "below") => string | null;
  convertBeatToStory: (beatId: string) => boolean;
  setAnchorGhostCount: (anchorId: string, side: "above" | "below", count: number) => void;
  updateLane: (laneId: string, patch: Partial<Pick<TimelineLane, "label" | "laneType" | "sortOrder">>) => void;
  updateBeat: (
    beatId: string,
    patch: Partial<Pick<TimelineBeat, "title" | "description" | "date" | "order" | "laneId">>
  ) => void;
  moveBeat: (beatId: string, targetLaneId: string, targetIndex: number) => void;
  removeLane: (laneId: string) => void;
  removeBeat: (beatId: string) => void;
  addConnection: (beatIds: string[]) => string | null;
  updateConnection: (
    connectionId: string,
    patch: Partial<Pick<TimelineConnection, "title" | "description" | "date">>
  ) => void;
  removeConnection: (connectionId: string) => void;
  toggleConnection: (beatIds: string[]) => { created: boolean; connectionId: string | null };
  reorderLane: (laneId: string, newIndex: number) => void;
  applyScriptText: (text: string) => { ok: boolean; errors: string[] };
  syncScriptDraftFromModel: () => string;
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  activeProjectId: null,
  timelineOrientation: "vertical",
  lanes: [],
  beats: [],
  connections: [],
  selection: [],
  zoomLaneCount: DEFAULT_ZOOM_LANE_COUNT,
  beatWidthPercent: DEFAULT_BEAT_WIDTH_PERCENT,
  beatsExpanded: false,
  expandedBeatHeightPx: DEFAULT_EXPANDED_BEAT_HEIGHT_PX,
  beatPlacementMode: "auto",
  requireAnchorSelection: false,
  scriptPanelLayout: "split",
  scriptDraft: null,
  hasUnsavedChanges: false,
  isSaving: false,
  lastSaveError: null,
  autosaveEnabled: true,

  loadTimeline: async (projectId) => {
    const driver = getStorageDriver();
    const payload = await driver.loadProjectData(projectId);
    const hadData = payload != null && isTimelineProjectPayload(payload);
    const orientation =
      hadData && payload.timelineOrientation === "horizontal" ? "horizontal" : "vertical";
    const lanes = hadData ? (payload.lanes ?? []) : [];
    const beats = hadData ? (payload.beats ?? []).map(normalizeLoadedBeat) : [];
    const connections = hadData ? (payload.connections ?? []).map(normalizeLoadedConnection) : [];

    set({
      activeProjectId: projectId,
      timelineOrientation: orientation,
      lanes,
      beats,
      connections,
      selection: [],
      scriptDraft: null,
      hasUnsavedChanges: false,
      lastSaveError: null,
      isSaving: false,
    });

    if (!hadData && payload == null) {
      await driver.saveProjectData(projectId, createDefaultTimelinePayload());
    }

    return { hadData: hadData || payload != null };
  },

  saveTimeline: async () => {
    const s = get();
    if (!s.activeProjectId) return false;
    set({ isSaving: true, lastSaveError: null });
    try {
      const driver = getStorageDriver();
      const payload: TimelineProjectPayload = {
        version: 1,
        moduleType: "timeline",
        timelineOrientation: s.timelineOrientation,
        lanes: s.lanes,
        beats: s.beats,
        connections: s.connections,
      };
      await driver.saveProjectData(s.activeProjectId, payload);
      await driver.updateProjectMeta(s.activeProjectId, { updatedAt: Date.now() });
      set({ hasUnsavedChanges: false, isSaving: false, scriptDraft: null });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Save failed";
      set({ isSaving: false, lastSaveError: message });
      return false;
    }
  },

  flushSaveAndSave: async () => {
    if (saveDebounce) {
      clearTimeout(saveDebounce);
      saveDebounce = null;
    }
    return get().saveTimeline();
  },

  setTimelineOrientation: (orientation) => {
    set({
      timelineOrientation: orientation,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
  },

  setScriptPanelLayout: (layout) => set({ scriptPanelLayout: layout }),

  setZoomLaneCount: (count) => set({ zoomLaneCount: count }),

  setBeatWidthPercent: (percent) =>
    set({
      beatWidthPercent: Math.min(BEAT_WIDTH_PERCENT_MAX, Math.max(BEAT_WIDTH_PERCENT_MIN, percent)),
    }),

  setBeatsExpanded: (expanded) => set({ beatsExpanded: expanded }),

  setExpandedBeatHeightPx: (px) =>
    set({
      expandedBeatHeightPx: Math.min(EXPANDED_BEAT_HEIGHT_MAX, Math.max(EXPANDED_BEAT_HEIGHT_MIN, px)),
    }),

  setBeatPlacementMode: (mode) => set({ beatPlacementMode: mode }),

  setRequireAnchorSelection: (enabled) => set({ requireAnchorSelection: enabled }),

  setSelection: (itemsOrFn) => {
    set((state) => ({
      selection: typeof itemsOrFn === "function" ? itemsOrFn(state.selection) : itemsOrFn,
    }));
  },

  selectOnly: (item) => set({ selection: item ? [item] : [] }),

  toggleSelection: (item) => {
    set((state) => {
      const exists = state.selection.some((s) => s.type === item.type && s.id === item.id);
      return {
        selection: exists
          ? state.selection.filter((s) => !(s.type === item.type && s.id === item.id))
          : [...state.selection, item],
      };
    });
  },

  addLane: () => {
    const s = get();
    const id = generateTimelineId();
    const sortOrder = s.lanes.length;
    const lane: TimelineLane = {
      id,
      label: getDefaultLaneLabel(sortOrder),
      laneType: "character",
      sortOrder,
    };
    set({
      lanes: [...s.lanes, lane],
      selection: [{ type: "lane", id }],
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return id;
  },

  addBeat: (laneId, kind = "story") => {
    const s = get();
    const targetLaneId = laneId ?? resolveLaneIdFromSelection(s.lanes, s.beats, s.selection);
    if (!targetLaneId) return null;
    const laneBeats = s.beats.filter((b) => b.laneId === targetLaneId);
    const nextOrder =
      laneBeats.length === 0 ? 0 : Math.max(...laneBeats.map((b) => b.order)) + 1;
    const id = generateTimelineId();
    const beat: TimelineBeat =
      kind === "empty"
        ? {
            id,
            laneId: targetLaneId,
            order: nextOrder,
            kind: "empty",
            title: "",
            description: "",
            date: "",
          }
        : {
            id,
            laneId: targetLaneId,
            order: nextOrder,
            kind: "story",
            title: getDefaultBeatTitle(laneBeats),
            description: "",
            date: "",
          };
    set({
      beats: [...s.beats, beat],
      selection: [{ type: "beat", id }],
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return id;
  },

  addAnchorBeat: (laneId, ghostsAbove = DEFAULT_ANCHOR_GHOSTS_ABOVE, ghostsBelow = DEFAULT_ANCHOR_GHOSTS_BELOW) => {
    const s = get();
    const targetLaneId = laneId ?? resolveLaneIdFromSelection(s.lanes, s.beats, s.selection);
    if (!targetLaneId) return null;

    const seq = s.beats
      .filter((b) => b.laneId === targetLaneId)
      .sort((a, b) => a.order - b.order);

    const anchorId = generateTimelineId();
    const anchor: TimelineBeat = {
      id: anchorId,
      laneId: targetLaneId,
      order: 0,
      kind: "anchor",
      title: getDefaultAnchorTitle(seq),
      description: "",
      date: "",
    };

    const belowGhosts: TimelineBeat[] = [];
    for (let i = 0; i < ghostsBelow; i++) {
      belowGhosts.push(createGhostBeat(targetLaneId, anchorId, "below"));
    }
    const aboveGhosts: TimelineBeat[] = [];
    for (let i = 0; i < ghostsAbove; i++) {
      aboveGhosts.push(createGhostBeat(targetLaneId, anchorId, "above"));
    }

    seq.push(...belowGhosts, anchor, ...aboveGhosts);

    set({
      beats: applyLaneSequence(s.beats, targetLaneId, seq),
      selection: [{ type: "beat", id: anchorId }],
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return anchorId;
  },

  addStoryBeatBeforeFirstAnchor: (laneId) => {
    const s = get();
    const targetLaneId = laneId ?? resolveLaneIdFromSelection(s.lanes, s.beats, s.selection);
    if (!targetLaneId) return null;

    const seq = s.beats
      .filter((b) => b.laneId === targetLaneId)
      .sort((a, b) => a.order - b.order);

    const firstAnchor = seq.find((b) => b.kind === "anchor") ?? null;
    const beat = spliceStoryBeatBeforeAnchor(seq, targetLaneId, firstAnchor?.id ?? null);

    set({
      beats: applyLaneSequence(s.beats, targetLaneId, seq),
      selection: [{ type: "beat", id: beat.id }],
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return beat.id;
  },

  addStoryBeatBeforeAnchor: (anchorId) => {
    const s = get();
    const anchor = s.beats.find((b) => b.id === anchorId);
    if (!anchor || anchor.kind !== "anchor") return null;
    const laneId = anchor.laneId;

    const seq = s.beats
      .filter((b) => b.laneId === laneId)
      .sort((a, b) => a.order - b.order);

    const beat = spliceStoryBeatBeforeAnchor(seq, laneId, anchorId);

    set({
      beats: applyLaneSequence(s.beats, laneId, seq),
      selection: [{ type: "beat", id: beat.id }],
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return beat.id;
  },

  insertStoryBeatRelativeToBeat: (beatId, position) => {
    const s = get();
    const reference = s.beats.find((b) => b.id === beatId);
    if (!reference) return null;
    const laneId = reference.laneId;

    const seq = s.beats
      .filter((b) => b.laneId === laneId)
      .sort((a, b) => a.order - b.order);

    const idx = seq.findIndex((b) => b.id === beatId);
    if (idx < 0) return null;

    const beat: TimelineBeat = {
      id: generateTimelineId(),
      laneId,
      order: 0,
      kind: "story",
      title: getDefaultBeatTitle(seq),
      description: "",
      date: "",
    };
    // Insert directly adjacent to the reference beat. If a ghost currently occupies that slot
    // (e.g. the reference beat sits right next to an anchor's protected zone), the splice simply
    // pushes it one position farther out — deliberate manual placement is never blocked by anchors.
    const insertAt = position === "above" ? idx + 1 : idx;
    seq.splice(insertAt, 0, beat);

    set({
      beats: applyLaneSequence(s.beats, laneId, seq),
      selection: [{ type: "beat", id: beat.id }],
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return beat.id;
  },

  convertBeatToStory: (beatId) => {
    const s = get();
    const beat = s.beats.find((b) => b.id === beatId);
    if (!beat || beat.kind !== "empty") return false;

    const laneBeatsExcluding = s.beats.filter((b) => b.laneId === beat.laneId && b.id !== beatId);
    const title = getDefaultBeatTitle(laneBeatsExcluding);

    const beats = s.beats.map((b) =>
      b.id === beatId
        ? {
            ...b,
            kind: "story" as const,
            title,
            anchorId: undefined,
            ghostSide: undefined,
          }
        : b
    );

    set({
      beats,
      selection: [{ type: "beat", id: beatId }],
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return true;
  },

  setAnchorGhostCount: (anchorId, side, count) => {
    const s = get();
    const anchor = s.beats.find((b) => b.id === anchorId);
    if (!anchor || anchor.kind !== "anchor") return;

    const clamped = Math.min(ANCHOR_GHOST_COUNT_MAX, Math.max(ANCHOR_GHOST_COUNT_MIN, count));
    const laneId = anchor.laneId;
    const seq = s.beats
      .filter((b) => b.laneId === laneId)
      .sort((a, b) => a.order - b.order);

    const anchorIndex = seq.findIndex((b) => b.id === anchorId);
    if (anchorIndex < 0) return;

    let runStart: number;
    let runEnd: number;

    if (side === "below") {
      runEnd = anchorIndex;
      runStart = anchorIndex;
      while (runStart > 0) {
        const prev = seq[runStart - 1];
        if (prev.kind === "empty" && prev.anchorId === anchorId && prev.ghostSide === "below") {
          runStart--;
        } else {
          break;
        }
      }
    } else {
      runStart = anchorIndex + 1;
      runEnd = runStart;
      while (runEnd < seq.length) {
        const b = seq[runEnd];
        if (b.kind === "empty" && b.anchorId === anchorId && b.ghostSide === "above") {
          runEnd++;
        } else {
          break;
        }
      }
    }

    const current = runEnd - runStart;
    if (clamped === current) return;

    if (clamped < current) {
      const removeCount = current - clamped;
      if (side === "below") {
        seq.splice(runStart, removeCount);
      } else {
        seq.splice(runEnd - removeCount, removeCount);
      }
    } else {
      const addCount = clamped - current;
      const newGhosts: TimelineBeat[] = [];
      for (let i = 0; i < addCount; i++) {
        newGhosts.push(createGhostBeat(laneId, anchorId, side));
      }
      if (side === "below") {
        seq.splice(runStart, 0, ...newGhosts);
      } else {
        seq.splice(runEnd, 0, ...newGhosts);
      }
    }

    set({
      beats: applyLaneSequence(s.beats, laneId, seq),
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  updateLane: (laneId, patch) => {
    const s = get();
    const lanes = s.lanes.map((lane) => (lane.id === laneId ? { ...lane, ...patch } : lane));
    set({
      lanes,
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  updateBeat: (beatId, patch) => {
    const s = get();
    const beats = s.beats.map((beat) => (beat.id === beatId ? { ...beat, ...patch } : beat));
    set({
      beats,
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  moveBeat: (beatId, targetLaneId, targetIndex) => {
    const s = get();
    const beat = s.beats.find((b) => b.id === beatId);
    if (!beat) return;
    const sourceLaneId = beat.laneId;

    const withoutMoved = s.beats.filter((b) => b.id !== beatId);
    const destBeats = withoutMoved
      .filter((b) => b.laneId === targetLaneId)
      .sort((a, b) => a.order - b.order);
    const clampedIndex = Math.max(0, Math.min(targetIndex, destBeats.length));
    destBeats.splice(clampedIndex, 0, { ...beat, laneId: targetLaneId });
    const renumberedDest = destBeats.map((b, i) => ({ ...b, order: i }));

    let beats: TimelineBeat[];
    if (sourceLaneId === targetLaneId) {
      beats = [...withoutMoved.filter((b) => b.laneId !== targetLaneId), ...renumberedDest];
    } else {
      const renumberedSource = withoutMoved
        .filter((b) => b.laneId === sourceLaneId)
        .sort((a, b) => a.order - b.order)
        .map((b, i) => ({ ...b, order: i }));
      beats = [
        ...withoutMoved.filter((b) => b.laneId !== targetLaneId && b.laneId !== sourceLaneId),
        ...renumberedSource,
        ...renumberedDest,
      ];
    }

    set({
      beats,
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  removeLane: (laneId) => {
    const s = get();
    const removedBeatIds = new Set(s.beats.filter((b) => b.laneId === laneId).map((b) => b.id));
    const lanes = s.lanes
      .filter((lane) => lane.id !== laneId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((lane, index) => ({ ...lane, sortOrder: index }));
    const beats = s.beats.filter((b) => b.laneId !== laneId);
    const connections = s.connections.filter(
      (c) => !c.beatIds.some((id) => removedBeatIds.has(id))
    );
    set({
      lanes,
      beats,
      connections,
      selection: s.selection.filter(
        (item) => !(item.type === "lane" && item.id === laneId) && !(item.type === "beat" && removedBeatIds.has(item.id))
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  removeBeat: (beatId) => {
    const s = get();
    const beat = s.beats.find((b) => b.id === beatId);
    if (!beat) return;

    const idsToRemove = new Set([beatId]);
    if (beat.kind === "anchor") {
      for (const b of s.beats) {
        if (b.anchorId === beatId && b.kind === "empty") {
          idsToRemove.add(b.id);
        }
      }
    }

    const remaining = s.beats.filter((b) => !idsToRemove.has(b.id));
    const beats = renormalizeLaneOrders(remaining, beat.laneId);
    const connections = s.connections.filter((c) => !c.beatIds.some((id) => idsToRemove.has(id)));
    set({
      beats,
      connections,
      selection: s.selection.filter(
        (item) => !(item.type === "beat" && idsToRemove.has(item.id))
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  addConnection: (beatIds) => {
    const deduped = [...new Set(beatIds)];
    const check = canFormCrossing(deduped, get().beats);
    if (!check.ok) return null;
    const s = get();
    const id = generateTimelineId();
    const connection: TimelineConnection = {
      id,
      beatIds: deduped,
      title: "",
      description: "",
      date: "",
    };
    set({
      connections: [...s.connections, connection],
      selection: [{ type: "connection", id }],
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return id;
  },

  updateConnection: (connectionId, patch) => {
    const s = get();
    const connections = s.connections.map((c) => (c.id === connectionId ? { ...c, ...patch } : c));
    set({
      connections,
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  removeConnection: (connectionId) => {
    const s = get();
    set({
      connections: s.connections.filter((c) => c.id !== connectionId),
      selection: s.selection.filter((item) => !(item.type === "connection" && item.id === connectionId)),
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  toggleConnection: (beatIds) => {
    const deduped = [...new Set(beatIds)];
    const check = canFormCrossing(deduped, get().beats);
    if (!check.ok) return { created: false, connectionId: null };
    const s = get();
    const existing = s.connections.find((c) => connectionMatchesBeatSet(c, deduped));
    if (existing) {
      set({
        connections: s.connections.filter((c) => c.id !== existing.id),
        selection: s.selection.filter(
          (item) => !(item.type === "connection" && item.id === existing.id)
        ),
        hasUnsavedChanges: true,
        lastSaveError: null,
        scriptDraft: null,
      });
      return { created: false, connectionId: existing.id };
    }
    const id = generateTimelineId();
    const connection: TimelineConnection = {
      id,
      beatIds: deduped,
      title: "",
      description: "",
      date: "",
    };
    set({
      connections: [...s.connections, connection],
      selection: [{ type: "connection", id }],
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return { created: true, connectionId: id };
  },

  reorderLane: (laneId, newIndex) => {
    const s = get();
    const sorted = [...s.lanes].sort((a, b) => a.sortOrder - b.sortOrder);
    const oldIndex = sorted.findIndex((lane) => lane.id === laneId);
    if (oldIndex < 0) return;
    const clampedIndex = Math.max(0, Math.min(newIndex, sorted.length - 1));
    if (oldIndex === clampedIndex) return;
    const reordered = arrayMove(sorted, oldIndex, clampedIndex);
    const lanes = reordered.map((lane, index) => ({ ...lane, sortOrder: index }));
    set({
      lanes,
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  applyScriptText: (text) => {
    const parsed = parseTimelineScript(text);
    if (parsed.errors.length > 0) {
      return { ok: false, errors: parsed.errors };
    }
    set({
      lanes: parsed.lanes,
      beats: parsed.beats,
      connections: parsed.connections,
      scriptDraft: text,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    return { ok: true, errors: [] };
  },

  syncScriptDraftFromModel: () => {
    const s = get();
    const text = generateTimelineScript(s.lanes, s.beats, s.connections);
    set({ scriptDraft: text });
    return text;
  },
}));

let saveDebounce: ReturnType<typeof setTimeout> | null = null;
let prevSnapshot = "";

function storeSnapshot(state: TimelineStore): string {
  return JSON.stringify({
    orientation: state.timelineOrientation,
    lanes: state.lanes,
    beats: state.beats,
    connections: state.connections,
  });
}

useTimelineStore.subscribe((state) => {
  const snapshot = storeSnapshot(state);
  const changed = snapshot !== prevSnapshot;
  prevSnapshot = snapshot;

  if (changed && state.activeProjectId && state.autosaveEnabled && state.hasUnsavedChanges) {
    if (saveDebounce) clearTimeout(saveDebounce);
    saveDebounce = setTimeout(() => {
      const s = useTimelineStore.getState();
      if (s.autosaveEnabled && s.activeProjectId && s.hasUnsavedChanges) {
        void s.saveTimeline();
      }
      saveDebounce = null;
    }, SAVE_DEBOUNCE_MS);
  }
});

export function getPrimarySelection(selection: TimelineSelectionItem[]): TimelineSelectionItem | null {
  return selection[0] ?? null;
}

export function getSelectedLane(
  lanes: TimelineLane[],
  selection: TimelineSelectionItem[]
): TimelineLane | null {
  const primary = getPrimarySelection(selection);
  if (!primary || primary.type !== "lane") return null;
  return lanes.find((l) => l.id === primary.id) ?? null;
}

export function getSelectedBeat(
  beats: TimelineBeat[],
  selection: TimelineSelectionItem[]
): TimelineBeat | null {
  const primary = getPrimarySelection(selection);
  if (!primary || primary.type !== "beat") return null;
  return beats.find((b) => b.id === primary.id) ?? null;
}

export function getSelectedConnection(
  connections: TimelineConnection[],
  selection: TimelineSelectionItem[]
): TimelineConnection | null {
  const primary = getPrimarySelection(selection);
  if (!primary || primary.type !== "connection") return null;
  return connections.find((c) => c.id === primary.id) ?? null;
}

export function isSelected(selection: TimelineSelectionItem[], item: TimelineSelectionItem): boolean {
  return selection.some((s) => s.type === item.type && s.id === item.id);
}
