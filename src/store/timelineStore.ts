import type { Edge, Node } from "reactflow";
import { create } from "zustand";
import {
  getStorageDriver,
  isTimelineProjectPayload,
  type TimelineOrientation,
  type TimelineProjectPayload,
} from "../storage/StorageDriver";
import { generateTimelineId } from "../storage/timelineIds";
import { buildTimelineGraph, getDefaultBeatTitle, getDefaultLaneLabel } from "./timelineGraph";
import { generateTimelineScript, parseTimelineScript } from "./timelineScript";
import {
  isLaneHeaderNodeId,
  laneHeaderNodeId,
  laneIdFromHeaderNodeId,
  type TimelineBeat,
  type TimelineLane,
  type TimelineNodeData,
} from "./timelineTypes";

const SAVE_DEBOUNCE_MS = 500;

export type { TimelineOrientation, TimelineLane, TimelineBeat, TimelineNodeData };
export { generateTimelineScript, parseTimelineScript, lineReferencesTimelineEntity } from "./timelineScript";
export { LANE_TYPE_PRESETS } from "./timelineTypes";

export function createDefaultTimelinePayload(): TimelineProjectPayload {
  return {
    version: 1,
    moduleType: "timeline",
    timelineOrientation: "vertical",
    lanes: [],
    beats: [],
  };
}

function rebuildGraph(
  lanes: TimelineLane[],
  beats: TimelineBeat[],
  orientation: TimelineOrientation
): { nodes: Node<TimelineNodeData>[]; edges: Edge[] } {
  return buildTimelineGraph(lanes, beats, orientation);
}

function resolveLaneIdFromSelection(
  lanes: TimelineLane[],
  beats: TimelineBeat[],
  selectedNodeIds: string[]
): string | null {
  if (selectedNodeIds.length === 0) return lanes[0]?.id ?? null;
  const primary = selectedNodeIds[0];
  const headerLaneId = laneIdFromHeaderNodeId(primary);
  if (headerLaneId) return headerLaneId;
  const beat = beats.find((b) => b.id === primary);
  if (beat) return beat.laneId;
  return lanes[0]?.id ?? null;
}

interface TimelineStore {
  activeProjectId: string | null;
  timelineOrientation: TimelineOrientation;
  lanes: TimelineLane[];
  beats: TimelineBeat[];
  nodes: Node<TimelineNodeData>[];
  edges: Edge[];
  selectedNodeIds: string[];
  primarySelectedNodeId: string | null;
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
  setSelectedNodeIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  addLane: () => string;
  addBeat: (laneId?: string) => string | null;
  updateLane: (laneId: string, patch: Partial<Pick<TimelineLane, "label" | "laneType" | "sortOrder">>) => void;
  updateBeat: (
    beatId: string,
    patch: Partial<Pick<TimelineBeat, "title" | "description" | "date" | "order" | "laneId">>
  ) => void;
  removeNodes: (nodeIds: string[]) => void;
  applyScriptText: (text: string) => { ok: boolean; errors: string[] };
  syncScriptDraftFromModel: () => string;
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  activeProjectId: null,
  timelineOrientation: "vertical",
  lanes: [],
  beats: [],
  nodes: [],
  edges: [],
  selectedNodeIds: [],
  primarySelectedNodeId: null,
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
    const beats = hadData ? (payload.beats ?? []) : [];
    const graph = rebuildGraph(lanes, beats, orientation);

    set({
      activeProjectId: projectId,
      timelineOrientation: orientation,
      lanes,
      beats,
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeIds: [],
      primarySelectedNodeId: null,
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
    const s = get();
    const graph = rebuildGraph(s.lanes, s.beats, orientation);
    set({
      timelineOrientation: orientation,
      nodes: graph.nodes,
      edges: graph.edges,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
  },

  setScriptPanelLayout: (layout) => set({ scriptPanelLayout: layout }),

  setSelectedNodeIds: (idsOrFn) => {
    set((state) => {
      const ids = typeof idsOrFn === "function" ? idsOrFn(state.selectedNodeIds) : idsOrFn;
      return {
        selectedNodeIds: ids,
        primarySelectedNodeId: ids[0] ?? null,
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
    const lanes = [...s.lanes, lane];
    const graph = rebuildGraph(lanes, s.beats, s.timelineOrientation);
    const headerId = laneHeaderNodeId(id);
    set({
      lanes,
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeIds: [headerId],
      primarySelectedNodeId: headerId,
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return id;
  },

  addBeat: (laneId) => {
    const s = get();
    const targetLaneId = laneId ?? resolveLaneIdFromSelection(s.lanes, s.beats, s.selectedNodeIds);
    if (!targetLaneId) return null;
    const laneBeats = s.beats.filter((b) => b.laneId === targetLaneId);
    const nextOrder =
      laneBeats.length === 0 ? 0 : Math.max(...laneBeats.map((b) => b.order)) + 1;
    const id = generateTimelineId();
    const beat: TimelineBeat = {
      id,
      laneId: targetLaneId,
      order: nextOrder,
      title: getDefaultBeatTitle(laneBeats),
      description: "",
      date: "",
    };
    const beats = [...s.beats, beat];
    const graph = rebuildGraph(s.lanes, beats, s.timelineOrientation);
    set({
      beats,
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeIds: [id],
      primarySelectedNodeId: id,
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return id;
  },

  updateLane: (laneId, patch) => {
    const s = get();
    const lanes = s.lanes.map((lane) => (lane.id === laneId ? { ...lane, ...patch } : lane));
    const graph = rebuildGraph(lanes, s.beats, s.timelineOrientation);
    set({
      lanes,
      nodes: graph.nodes,
      edges: graph.edges,
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  updateBeat: (beatId, patch) => {
    const s = get();
    const beats = s.beats.map((beat) => (beat.id === beatId ? { ...beat, ...patch } : beat));
    const graph = rebuildGraph(s.lanes, beats, s.timelineOrientation);
    set({
      beats,
      nodes: graph.nodes,
      edges: graph.edges,
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  removeNodes: (nodeIds) => {
    const s = get();
    const laneIdsToRemove = new Set<string>();
    const beatIdsToRemove = new Set<string>();

    for (const nodeId of nodeIds) {
      const headerLaneId = laneIdFromHeaderNodeId(nodeId);
      if (headerLaneId) {
        laneIdsToRemove.add(headerLaneId);
        continue;
      }
      if (s.beats.some((b) => b.id === nodeId)) {
        beatIdsToRemove.add(nodeId);
      }
    }

    const lanes = s.lanes
      .filter((lane) => !laneIdsToRemove.has(lane.id))
      .map((lane, index) => ({ ...lane, sortOrder: index }));

    let beats = s.beats.filter(
      (beat) => !beatIdsToRemove.has(beat.id) && !laneIdsToRemove.has(beat.laneId)
    );

    const normalizedBeats: TimelineBeat[] = [];
    for (const lane of lanes) {
      const laneBeats = beats
        .filter((b) => b.laneId === lane.id)
        .sort((a, b) => a.order - b.order)
        .map((beat, index) => ({ ...beat, order: index }));
      normalizedBeats.push(...laneBeats);
    }
    beats = normalizedBeats;

    const graph = rebuildGraph(lanes, beats, s.timelineOrientation);
    set({
      lanes,
      beats,
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeIds: [],
      primarySelectedNodeId: null,
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
    const s = get();
    const graph = rebuildGraph(parsed.lanes, parsed.beats, s.timelineOrientation);
    set({
      lanes: parsed.lanes,
      beats: parsed.beats,
      nodes: graph.nodes,
      edges: graph.edges,
      scriptDraft: text,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    return { ok: true, errors: [] };
  },

  syncScriptDraftFromModel: () => {
    const s = get();
    const text = generateTimelineScript(s.lanes, s.beats);
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

export function getSelectedLane(
  lanes: TimelineLane[],
  beats: TimelineBeat[],
  primarySelectedNodeId: string | null
): TimelineLane | null {
  if (!primarySelectedNodeId) return null;
  const headerLaneId = laneIdFromHeaderNodeId(primarySelectedNodeId);
  if (headerLaneId) return lanes.find((l) => l.id === headerLaneId) ?? null;
  const beat = beats.find((b) => b.id === primarySelectedNodeId);
  if (beat) return lanes.find((l) => l.id === beat.laneId) ?? null;
  return null;
}

export function getSelectedBeat(
  beats: TimelineBeat[],
  primarySelectedNodeId: string | null
): TimelineBeat | null {
  if (!primarySelectedNodeId || isLaneHeaderNodeId(primarySelectedNodeId)) return null;
  return beats.find((b) => b.id === primarySelectedNodeId) ?? null;
}
