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
  BEAT_WIDTH_PERCENT_MAX,
  BEAT_WIDTH_PERCENT_MIN,
  DEFAULT_BEAT_WIDTH_PERCENT,
  DEFAULT_EXPANDED_BEAT_HEIGHT_PX,
  DEFAULT_ZOOM_LANE_COUNT,
  EXPANDED_BEAT_HEIGHT_MAX,
  EXPANDED_BEAT_HEIGHT_MIN,
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

function resolveLaneIdFromSelection(
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

type StoredConnection = TimelineConnectionRecord & {
  beatIdA?: string;
  beatIdB?: string;
};

function normalizeLoadedBeat(beat: TimelineBeatRecord): TimelineBeat {
  return {
    id: beat.id,
    laneId: beat.laneId,
    order: beat.order,
    kind: beat.kind === "empty" ? "empty" : "story",
    title: beat.title,
    description: beat.description,
    date: beat.date,
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
  setSelection: (
    items: TimelineSelectionItem[] | ((prev: TimelineSelectionItem[]) => TimelineSelectionItem[])
  ) => void;
  selectOnly: (item: TimelineSelectionItem | null) => void;
  toggleSelection: (item: TimelineSelectionItem) => void;
  addLane: () => string;
  addBeat: (laneId?: string, kind?: "story" | "empty") => string | null;
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
    const remaining = s.beats.filter((b) => b.id !== beatId);
    const beats = renormalizeLaneOrders(remaining, beat.laneId);
    const connections = s.connections.filter((c) => !c.beatIds.includes(beatId));
    set({
      beats,
      connections,
      selection: s.selection.filter((item) => !(item.type === "beat" && item.id === beatId)),
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
