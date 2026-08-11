import { arrayMove } from "@dnd-kit/sortable";
import { create } from "zustand";
import {
  getStorageDriver,
  isTimelineProjectPayload,
  type TimelineBeatRecord,
  type TimelineConnectionRecord,
  type TimelineDocumentRecord,
  type TimelineOrientation,
  type TimelineProjectPayload,
} from "../storage/StorageDriver";
import { generateTimelineId } from "../storage/timelineIds";
import { emptyBeatDateSpec, migrateLegacyDateString } from "../utils/beatDate";
import { generateTimelineScript, parseTimelineScript } from "./timelineScript";
import {
  findLaneBlockSpans,
  removeLaneBlockFromText,
} from "./timelineTextBlocks";
import {
  BEAT_GAP_PX,
  BEAT_TEXT_SCALE_PERCENT_MAX,
  BEAT_TEXT_SCALE_PERCENT_MIN,
  BEAT_WIDTH_PERCENT_MAX,
  BEAT_WIDTH_PERCENT_MIN,
  type BeatDateSpec,
  DEFAULT_BEAT_TEXT_SCALE_PERCENT,
  DEFAULT_BEAT_WIDTH_PERCENT,
  DEFAULT_EXPANDED_BEAT_HEIGHT_PX,
  DEFAULT_ZOOM_LANE_COUNT,
  EXPANDED_BEAT_HEIGHT_MAX,
  EXPANDED_BEAT_HEIGHT_MIN,
  getDefaultAnchorTitle,
  getDefaultBeatTitle,
  getDefaultLaneLabel,
  LANE_TRACK_PADDING_PX,
  SLOT_HEADROOM,
  type TimelineBeat,
  type TimelineConnection,
  type TimelineLane,
  type TimelineSelectionItem,
} from "./timelineTypes";

const SAVE_DEBOUNCE_MS = 500;

export type { TimelineLane, TimelineBeat, TimelineConnection, TimelineSelectionItem, BeatDateSpec, BeatDateMode, BeatDateRelative } from "./timelineTypes";
export type { TimelineOrientation, TimelineDocumentRecord } from "../storage/StorageDriver";
export { resolveBeatDate, resolveBeatAbsoluteIso, emptyBeatDateSpec, dateSpecFromImportText, dateSpecFromResolvedText } from "../utils/beatDate";
export { generateTimelineScript, parseTimelineScript, lineReferencesTimelineEntity, compactTimelineScriptDisplay } from "./timelineScript";
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
  BEAT_GAP_PX,
  LANE_TRACK_PADDING_PX,
  SLOT_HEADROOM,
  getZoomLaneCountSteps,
  snapZoomLaneCount,
} from "./timelineTypes";

export function createDefaultTimelinePayload(): TimelineProjectPayload {
  return {
    version: 1,
    moduleType: "timeline",
    timelineOrientation: "vertical",
    displayMode: "block",
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

/** Shift every beat in `laneId` at slot >= `fromSlot` up by one, opening a free slot at
 * `fromSlot` for something new to land on. */
function makeRoomAtSlot(beats: TimelineBeat[], laneId: string, fromSlot: number): TimelineBeat[] {
  return beats.map((b) => (b.laneId === laneId && b.slot >= fromSlot ? { ...b, slot: b.slot + 1 } : b));
}

type StoredConnection = TimelineConnectionRecord & {
  beatIdA?: string;
  beatIdB?: string;
};

/**
 * Migrate a stored beat record into the current slot-grid model. Legacy "empty" ghost/spacer
 * beats are dropped entirely — the slot grid represents gaps natively now, so they no longer
 * serve any purpose. Legacy records used a compact per-lane `order` (0..n-1); reusing that value
 * directly as the new absolute `slot` preserves each surviving beat's original relative spacing
 * (any gaps that used to be filled by ghost beats become genuinely empty slots).
 */
function normalizeDateSpec(beat: TimelineBeatRecord): BeatDateSpec {
  if (beat.dateSpec) return beat.dateSpec;
  return migrateLegacyDateString(beat.date);
}

function normalizeLoadedBeat(beat: TimelineBeatRecord): TimelineBeat | null {
  if (beat.kind === "empty") return null;
  const kind = beat.kind === "anchor" ? "anchor" : "story";
  const slot = typeof beat.slot === "number" ? beat.slot : beat.order ?? 0;
  return {
    id: beat.id,
    laneId: beat.laneId,
    slot,
    kind,
    title: beat.title,
    synopsis: beat.synopsis ?? "",
    detail: beat.detail ?? beat.description ?? "",
    dateSpec: normalizeDateSpec(beat),
  };
}

function stripLegacyDocumentFields(doc: TimelineDocumentRecord): TimelineDocumentRecord {
  return {
    id: doc.id,
    name: doc.name,
    content: doc.content,
    updatedAt: doc.updatedAt,
  };
}

function combineDocumentContents(
  documents: TimelineDocumentRecord[],
  edits: Map<string, string>
): string {
  const sorted = [...documents].sort((a, b) => a.id.localeCompare(b.id));
  return sorted
    .map((doc) => edits.get(doc.id) ?? doc.content)
    .filter((content) => content.trim().length > 0)
    .join("\n\n");
}

function migrateDocuments(
  documents: TimelineDocumentRecord[],
  lanes: TimelineLane[],
  beats: TimelineBeat[]
): { documents: TimelineDocumentRecord[]; migrated: boolean } {
  let migrated = false;
  const next = documents.map((doc) => {
    if (doc.kind === "derived" && doc.laneId) {
      const lane = lanes.find((l) => l.id === doc.laneId);
      if (lane) {
        migrated = true;
        const laneBeats = beats.filter((b) => b.laneId === lane.id);
        return stripLegacyDocumentFields({
          id: doc.id,
          name: doc.name,
          content: generateTimelineScript([lane], laneBeats, [], { includeSectionMarkers: false }),
          updatedAt: doc.updatedAt,
        });
      }
    }
    const stripped = stripLegacyDocumentFields(doc);
    if (doc.kind != null || doc.laneId != null) {
      migrated = true;
    }
    return stripped;
  });
  return { documents: next, migrated };
}

function syncDocumentsFromModel(
  documents: TimelineDocumentRecord[],
  lanes: TimelineLane[],
  beats: TimelineBeat[],
  dirtyDocumentIds: string[]
): TimelineDocumentRecord[] | null {
  const dirtySet = new Set(dirtyDocumentIds);
  const laneById = new Map(lanes.map((l) => [l.id, l]));
  let anyChanged = false;

  const updated = documents.map((doc) => {
    if (dirtySet.has(doc.id)) return doc;

    const spans = findLaneBlockSpans(doc.content);
    if (spans.length === 0) return doc;

    let content = doc.content;
    let docChanged = false;
    const sortedSpans = [...spans].sort((a, b) => b.start - a.start);

    for (const span of sortedSpans) {
      const lane = laneById.get(span.laneId);
      if (!lane) {
        content = removeLaneBlockFromText(content, span);
        docChanged = true;
        anyChanged = true;
        continue;
      }

      const laneBeats = beats.filter((b) => b.laneId === lane.id);
      const newBlock = generateTimelineScript([lane], laneBeats, [], {
        includeSectionMarkers: false,
      }).trimEnd();
      const oldBlock = content.slice(span.start, span.end).trimEnd();
      if (oldBlock !== newBlock) {
        content = content.slice(0, span.start) + newBlock + content.slice(span.end);
        docChanged = true;
        anyChanged = true;
      }
    }

    if (!docChanged) return doc;
    return { ...doc, content, updatedAt: Date.now() };
  });

  return anyChanged ? updated : null;
}

export function previewDocumentDeleteCounts(content: string): {
  laneCount: number;
  beatCount: number;
  crossingCount: number;
} {
  const parsed = parseTimelineScript(content);
  return {
    laneCount: parsed.lanes.length,
    beatCount: parsed.beats.length,
    crossingCount: parsed.connections.length,
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
): { ok: boolean; reason?: "fewer-than-2" | "not-found" | "same-lane" } {
  const deduped = [...new Set(beatIds)];
  if (deduped.length < 2) return { ok: false, reason: "fewer-than-2" };

  const beatMap = new Map(beats.map((b) => [b.id, b]));
  const laneIds: string[] = [];
  for (const id of deduped) {
    const beat = beatMap.get(id);
    if (!beat) return { ok: false, reason: "not-found" };
    laneIds.push(beat.laneId);
  }
  if (new Set(laneIds).size !== laneIds.length) return { ok: false, reason: "same-lane" };
  return { ok: true };
}

/** Pixels needed for a lane's track to comfortably show every occupied slot on the board, plus a
 * little headroom to drag beyond the current highest beat. */
export function computeSlotTrackContentHeightPx(
  beats: TimelineBeat[],
  beatHeightPx: number
): number {
  const globalMaxSlot = beats.length > 0 ? Math.max(...beats.map((b) => b.slot)) : -1;
  const slotStepPx = beatHeightPx + BEAT_GAP_PX;
  return (globalMaxSlot + 1 + SLOT_HEADROOM) * slotStepPx + LANE_TRACK_PADDING_PX * 2;
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
  displayMode: "block" | "text";
  lanes: TimelineLane[];
  beats: TimelineBeat[];
  connections: TimelineConnection[];
  selection: TimelineSelectionItem[];
  zoomLaneCount: number;
  beatWidthPercent: number;
  beatTextScalePercent: number;
  beatsExpanded: boolean;
  expandedBeatHeightPx: number;
  beatPlacementMode: "auto" | "above" | "below";
  magnifyToolActive: boolean;
  magnifiedBeatId: string | null;
  scriptPanelLayout: "split" | "codeOnly" | "viewOnly";
  scriptDraft: string | null;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  lastSaveError: string | null;
  autosaveEnabled: boolean;
  importLabelPrefixes: string[];
  documents: TimelineDocumentRecord[];
  /** Ephemeral — doc ids with unsaved text-mode drafts; never persisted. */
  dirtyDocumentIds: string[];
  setDirtyDocumentIds: (ids: string[]) => void;
  loadTimeline: (projectId: string) => Promise<{ hadData: boolean }>;
  saveTimeline: () => Promise<boolean>;
  flushSaveAndSave: () => Promise<boolean>;
  setTimelineOrientation: (orientation: TimelineOrientation) => void;
  setDisplayMode: (mode: "block" | "text") => void;
  setScriptPanelLayout: (layout: "split" | "codeOnly" | "viewOnly") => void;
  setZoomLaneCount: (count: number) => void;
  setBeatWidthPercent: (percent: number) => void;
  setBeatTextScalePercent: (percent: number) => void;
  setBeatsExpanded: (expanded: boolean) => void;
  setExpandedBeatHeightPx: (px: number) => void;
  setBeatPlacementMode: (mode: "auto" | "above" | "below") => void;
  setMagnifyToolActive: (active: boolean) => void;
  setMagnifiedBeatId: (id: string | null) => void;
  setSelection: (
    items: TimelineSelectionItem[] | ((prev: TimelineSelectionItem[]) => TimelineSelectionItem[])
  ) => void;
  selectOnly: (item: TimelineSelectionItem | null) => void;
  toggleSelection: (item: TimelineSelectionItem) => void;
  addLane: () => string;
  addBeat: (laneId?: string, kind?: "story" | "anchor") => string | null;
  importBeats: (
    laneId: string,
    items: { title: string; synopsis: string; detail: string; dateSpec: BeatDateSpec }[]
  ) => string[];
  createBeatsFromSegments: (
    laneId: string,
    items: { title: string; synopsis: string; detail: string; dateSpec: BeatDateSpec }[]
  ) => string[];
  saveDocument: (id: string | null, name: string, content: string) => string;
  deleteDocument: (id: string) => void;
  deleteDocumentCascade: (
    docId: string,
    content: string
  ) => { laneCount: number; beatCount: number; crossingCount: number };
  renameDocument: (id: string, name: string) => void;
  createUserDocument: (name?: string) => string;
  applyDocumentEdits: (
    edits: { docId: string; content: string }[]
  ) => { ok: boolean; errors: string[] };
  insertPendingBeats: (laneId: string, slots: number[]) => string[];
  bulkRenameBeatTitles: (beatIds: string[], baseLabel: string) => void;
  addImportLabelPrefix: (prefix: string) => void;
  removeImportLabelPrefix: (prefix: string) => void;
  insertStoryBeatRelativeToBeat: (beatId: string, position: "above" | "below") => string | null;
  updateLane: (laneId: string, patch: Partial<Pick<TimelineLane, "label" | "laneType" | "sortOrder" | "color">>) => void;
  updateBeat: (
    beatId: string,
    patch: Partial<Pick<TimelineBeat, "title" | "synopsis" | "detail" | "dateSpec" | "slot" | "laneId">>
  ) => void;
  /** Move (or swap) a beat onto an absolute slot in a lane. If that slot is already occupied by a
   * different beat, the two beats trade places (lane + slot). */
  moveBeat: (beatId: string, targetLaneId: string, targetSlot: number) => void;
  moveBeatsGroup: (moves: { beatId: string; laneId: string; slot: number }[]) => void;
  removeLane: (laneId: string) => void;
  removeBeat: (beatId: string) => void;
  removeBeats: (beatIds: string[]) => void;
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
  displayMode: "block",
  lanes: [],
  beats: [],
  connections: [],
  selection: [],
  zoomLaneCount: DEFAULT_ZOOM_LANE_COUNT,
  beatWidthPercent: DEFAULT_BEAT_WIDTH_PERCENT,
  beatTextScalePercent: DEFAULT_BEAT_TEXT_SCALE_PERCENT,
  beatsExpanded: false,
  expandedBeatHeightPx: DEFAULT_EXPANDED_BEAT_HEIGHT_PX,
  beatPlacementMode: "auto",
  magnifyToolActive: false,
  magnifiedBeatId: null,
  scriptPanelLayout: "split",
  scriptDraft: null,
  hasUnsavedChanges: false,
  isSaving: false,
  lastSaveError: null,
  autosaveEnabled: true,
  importLabelPrefixes: [],
  documents: [],
  dirtyDocumentIds: [],

  setDirtyDocumentIds: (ids) => set({ dirtyDocumentIds: ids }),

  loadTimeline: async (projectId) => {
    const driver = getStorageDriver();
    const payload = await driver.loadProjectData(projectId);
    const hadData = payload != null && isTimelineProjectPayload(payload);
    const orientation =
      hadData && payload.timelineOrientation === "horizontal" ? "horizontal" : "vertical";
    const displayMode =
      hadData && payload.displayMode === "text" ? "text" : "block";
    const lanes = hadData ? (payload.lanes ?? []) : [];
    const beats = hadData
      ? (payload.beats ?? [])
          .map(normalizeLoadedBeat)
          .filter((b): b is TimelineBeat => b !== null)
      : [];
    const connections = hadData ? (payload.connections ?? []).map(normalizeLoadedConnection) : [];
    const rawDocuments = hadData ? (payload.documents ?? []) : [];
    const { documents, migrated: documentsMigrated } = migrateDocuments(rawDocuments, lanes, beats);

    set({
      activeProjectId: projectId,
      timelineOrientation: orientation,
      displayMode,
      lanes,
      beats,
      connections,
      importLabelPrefixes: hadData ? (payload.importLabelPrefixes ?? []) : [],
      documents,
      beatWidthPercent: hadData
        ? (payload.beatWidthPercent ?? DEFAULT_BEAT_WIDTH_PERCENT)
        : DEFAULT_BEAT_WIDTH_PERCENT,
      expandedBeatHeightPx: hadData
        ? (payload.expandedBeatHeightPx ?? DEFAULT_EXPANDED_BEAT_HEIGHT_PX)
        : DEFAULT_EXPANDED_BEAT_HEIGHT_PX,
      beatTextScalePercent: hadData
        ? (payload.beatTextScalePercent ?? DEFAULT_BEAT_TEXT_SCALE_PERCENT)
        : DEFAULT_BEAT_TEXT_SCALE_PERCENT,
      selection: [],
      magnifyToolActive: false,
      magnifiedBeatId: null,
      scriptDraft: null,
      hasUnsavedChanges: documentsMigrated,
      lastSaveError: null,
      isSaving: false,
      dirtyDocumentIds: [],
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
        displayMode: s.displayMode,
        lanes: s.lanes,
        beats: s.beats,
        connections: s.connections,
        importLabelPrefixes: s.importLabelPrefixes,
        documents: s.documents.map(stripLegacyDocumentFields),
        beatWidthPercent: s.beatWidthPercent,
        expandedBeatHeightPx: s.expandedBeatHeightPx,
        beatTextScalePercent: s.beatTextScalePercent,
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

  setDisplayMode: (mode) => {
    set({
      displayMode: mode,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
  },

  setScriptPanelLayout: (layout) => set({ scriptPanelLayout: layout }),

  setZoomLaneCount: (count) => set({ zoomLaneCount: count }),

  setBeatWidthPercent: (percent) =>
    set({
      beatWidthPercent: Math.min(BEAT_WIDTH_PERCENT_MAX, Math.max(BEAT_WIDTH_PERCENT_MIN, percent)),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }),

  setBeatTextScalePercent: (percent) =>
    set({
      beatTextScalePercent: Math.min(
        BEAT_TEXT_SCALE_PERCENT_MAX,
        Math.max(BEAT_TEXT_SCALE_PERCENT_MIN, percent)
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }),

  setBeatsExpanded: (expanded) => set({ beatsExpanded: expanded }),

  setExpandedBeatHeightPx: (px) =>
    set({
      expandedBeatHeightPx: Math.round(
        Math.min(EXPANDED_BEAT_HEIGHT_MAX, Math.max(EXPANDED_BEAT_HEIGHT_MIN, px))
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }),

  setBeatPlacementMode: (mode) => set({ beatPlacementMode: mode }),

  setMagnifyToolActive: (active) =>
    set({
      magnifyToolActive: active,
      magnifiedBeatId: active ? get().magnifiedBeatId : null,
    }),

  setMagnifiedBeatId: (id) => set({ magnifiedBeatId: id }),

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
    const now = Date.now();
    const seedDoc: TimelineDocumentRecord = {
      id: generateTimelineId(),
      name: lane.label,
      content: generateTimelineScript([lane], [], [], { includeSectionMarkers: false }),
      updatedAt: now,
    };
    set({
      lanes: [...s.lanes, lane],
      documents: [...s.documents, seedDoc],
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
    const nextSlot = laneBeats.length === 0 ? 0 : Math.max(...laneBeats.map((b) => b.slot)) + 1;
    const id = generateTimelineId();
    const beat: TimelineBeat = {
      id,
      laneId: targetLaneId,
      slot: nextSlot,
      kind,
      title: kind === "anchor" ? getDefaultAnchorTitle(laneBeats) : getDefaultBeatTitle(laneBeats),
      synopsis: "",
      detail: "",
      dateSpec: emptyBeatDateSpec(),
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

  importBeats: (laneId, items) => {
    if (items.length === 0) return [];
    const s = get();
    const laneBeats = s.beats.filter((b) => b.laneId === laneId);
    let nextSlot =
      laneBeats.length === 0 ? 0 : Math.max(...laneBeats.map((b) => b.slot)) + 1;

    const newBeats: TimelineBeat[] = items.map((item) => {
      const beat: TimelineBeat = {
        id: generateTimelineId(),
        laneId,
        slot: nextSlot++,
        kind: "story",
        title: item.title,
        synopsis: item.synopsis,
        detail: item.detail,
        dateSpec: item.dateSpec,
      };
      return beat;
    });

    const lastId = newBeats[newBeats.length - 1]?.id ?? null;
    set({
      beats: [...s.beats, ...newBeats],
      selection: lastId ? [{ type: "beat", id: lastId }] : s.selection,
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return newBeats.map((b) => b.id);
  },

  createBeatsFromSegments: (laneId, items) => {
    return get().importBeats(laneId, items);
  },

  saveDocument: (id, name, content) => {
    const s = get();
    const trimmedName = name.trim() || "Untitled";
    const now = Date.now();
    if (id) {
      const docs = s.documents.map((d) =>
        d.id === id ? { ...d, name: trimmedName, content, updatedAt: now } : d
      );
      set({ documents: docs, hasUnsavedChanges: true, lastSaveError: null });
      return id;
    }
    const newId = generateTimelineId();
    const doc: TimelineDocumentRecord = {
      id: newId,
      name: trimmedName,
      content,
      updatedAt: now,
    };
    set({
      documents: [...s.documents, doc],
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    return newId;
  },

  deleteDocument: (id) => {
    set((s) => ({
      documents: s.documents.filter((d) => d.id !== id),
      dirtyDocumentIds: s.dirtyDocumentIds.filter((docId) => docId !== id),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
  },

  deleteDocumentCascade: (docId, content) => {
    const s = get();
    const parsed = parseTimelineScript(content);
    const laneIds = new Set(parsed.lanes.map((l) => l.id));
    const beatIds = new Set(parsed.beats.map((b) => b.id));
    const crossingIds = new Set(parsed.connections.map((c) => c.id));

    const removedBeatIds = new Set<string>();
    for (const beat of s.beats) {
      if (beatIds.has(beat.id) || laneIds.has(beat.laneId)) {
        removedBeatIds.add(beat.id);
      }
    }

    const lanes = s.lanes
      .filter((lane) => !laneIds.has(lane.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((lane, index) => ({ ...lane, sortOrder: index }));
    const beats = s.beats.filter((b) => !removedBeatIds.has(b.id));
    const connections = s.connections.filter((c) => {
      if (crossingIds.has(c.id)) return false;
      return !c.beatIds.some((id) => removedBeatIds.has(id));
    });

    set({
      lanes,
      beats,
      connections,
      documents: s.documents.filter((d) => d.id !== docId),
      dirtyDocumentIds: s.dirtyDocumentIds.filter((id) => id !== docId),
      selection: s.selection.filter(
        (item) =>
          !(item.type === "lane" && laneIds.has(item.id)) &&
          !(item.type === "beat" && removedBeatIds.has(item.id)) &&
          !(item.type === "connection" && crossingIds.has(item.id))
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });

    return {
      laneCount: laneIds.size,
      beatCount: beatIds.size,
      crossingCount: crossingIds.size,
    };
  },

  renameDocument: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === id ? { ...d, name: trimmed, updatedAt: Date.now() } : d
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
  },

  createUserDocument: (name) => {
    const s = get();
    const id = generateTimelineId();
    const doc: TimelineDocumentRecord = {
      id,
      name: (name ?? "Untitled").trim() || "Untitled",
      content: "",
      updatedAt: Date.now(),
    };
    set({
      documents: [...s.documents, doc],
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    return id;
  },

  applyDocumentEdits: (edits) => {
    const s = get();
    const editMap = new Map(edits.map((e) => [e.docId, e.content]));
    const combined = combineDocumentContents(s.documents, editMap);
    const parsed = parseTimelineScript(combined);
    if (parsed.errors.length > 0) {
      return { ok: false, errors: parsed.errors };
    }

    const now = Date.now();
    const updatedDocs = s.documents.map((doc) => {
      const newContent = editMap.get(doc.id);
      if (newContent !== undefined) {
        return stripLegacyDocumentFields({ ...doc, content: newContent, updatedAt: now });
      }
      return stripLegacyDocumentFields(doc);
    });

    const editDocIds = [...editMap.keys()];
    set({
      lanes: parsed.lanes,
      beats: parsed.beats,
      connections: parsed.connections,
      documents: updatedDocs,
      dirtyDocumentIds: s.dirtyDocumentIds.filter((id) => !editDocIds.includes(id)),
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return { ok: true, errors: [] };
  },

  insertPendingBeats: (laneId, slots) => {
    if (slots.length === 0) return [];
    const s = get();
    const sortedSlots = [...slots].sort((a, b) => b - a);
    let beats = [...s.beats];
    const created: TimelineBeat[] = [];
    const laneBeats = beats.filter((b) => b.laneId === laneId);

    for (const slot of sortedSlots) {
      beats = makeRoomAtSlot(beats, laneId, slot);
      const beat: TimelineBeat = {
        id: generateTimelineId(),
        laneId,
        slot,
        kind: "story",
        title: getDefaultBeatTitle([...laneBeats, ...created]),
        synopsis: "",
        detail: "",
        dateSpec: emptyBeatDateSpec(),
      };
      created.push(beat);
    }

    set({
      beats: [...beats, ...created],
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return created.map((b) => b.id);
  },

  bulkRenameBeatTitles: (beatIds, baseLabel) => {
    const trimmed = baseLabel.trim() || "Beat";
    const s = get();
    const idSet = new Set(beatIds);
    const ordered = s.beats
      .filter((b) => idSet.has(b.id))
      .sort((a, b) => a.slot - b.slot);
    const titleById = new Map<string, string>();
    ordered.forEach((b, i) => titleById.set(b.id, `${trimmed} ${i + 1}`));
    set({
      beats: s.beats.map((b) =>
        titleById.has(b.id) ? { ...b, title: titleById.get(b.id)! } : b
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  addImportLabelPrefix: (prefix) => {
    const trimmed = prefix.trim();
    if (!trimmed) return;
    set((s) => ({
      importLabelPrefixes: s.importLabelPrefixes.includes(trimmed)
        ? s.importLabelPrefixes
        : [...s.importLabelPrefixes, trimmed],
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
  },

  removeImportLabelPrefix: (prefix) => {
    set((s) => ({
      importLabelPrefixes: s.importLabelPrefixes.filter((p) => p !== prefix),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
  },

  insertStoryBeatRelativeToBeat: (beatId, position) => {
    const s = get();
    const reference = s.beats.find((b) => b.id === beatId);
    if (!reference) return null;
    const laneId = reference.laneId;

    const rawTarget = position === "above" ? reference.slot + 1 : reference.slot - 1;
    const targetSlot = Math.max(0, rawTarget);
    const occupied = s.beats.some((b) => b.laneId === laneId && b.slot === targetSlot);
    const beatsAfterShift = occupied ? makeRoomAtSlot(s.beats, laneId, targetSlot) : s.beats;

    const beat: TimelineBeat = {
      id: generateTimelineId(),
      laneId,
      slot: targetSlot,
      kind: "story",
      title: getDefaultBeatTitle(s.beats.filter((b) => b.laneId === laneId)),
      synopsis: "",
      detail: "",
      dateSpec: emptyBeatDateSpec(),
    };

    set({
      beats: [...beatsAfterShift, beat],
      selection: [{ type: "beat", id: beat.id }],
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
    return beat.id;
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

  moveBeat: (beatId, targetLaneId, targetSlot) => {
    const s = get();
    const beat = s.beats.find((b) => b.id === beatId);
    if (!beat) return;
    const clampedSlot = Math.max(0, targetSlot);
    if (beat.laneId === targetLaneId && beat.slot === clampedSlot) return;

    // If the target slot is already occupied by a different beat, the two trade places (lane +
    // slot) instead of one silently overwriting the other — there's no "renumbering" step needed
    // since slots are absolute, not a compact per-lane sequence.
    const occupant = s.beats.find(
      (b) => b.id !== beatId && b.laneId === targetLaneId && b.slot === clampedSlot
    );

    const beats = s.beats.map((b) => {
      if (b.id === beatId) return { ...b, laneId: targetLaneId, slot: clampedSlot };
      if (occupant && b.id === occupant.id) return { ...b, laneId: beat.laneId, slot: beat.slot };
      return b;
    });

    set({
      beats,
      hasUnsavedChanges: true,
      lastSaveError: null,
      scriptDraft: null,
    });
  },

  moveBeatsGroup: (moves) => {
    const s = get();
    if (moves.length === 0) return;
    const movingIds = new Set(moves.map((m) => m.beatId));
    const originalById = new Map<string, { laneId: string; slot: number }>();
    for (const id of movingIds) {
      const b = s.beats.find((x) => x.id === id);
      if (b) originalById.set(id, { laneId: b.laneId, slot: b.slot });
    }

    let beats = s.beats.map((b) => {
      const move = moves.find((m) => m.beatId === b.id);
      if (move) return { ...b, laneId: move.laneId, slot: Math.max(0, move.slot) };
      return b;
    });

    for (const move of moves) {
      const origin = originalById.get(move.beatId);
      if (!origin) continue;
      const clampedSlot = Math.max(0, move.slot);
      const occupant = beats.find(
        (b) => !movingIds.has(b.id) && b.laneId === move.laneId && b.slot === clampedSlot
      );
      if (occupant) {
        beats = beats.map((b) =>
          b.id === occupant.id ? { ...b, laneId: origin.laneId, slot: origin.slot } : b
        );
      }
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
    get().removeBeats([beatId]);
  },

  removeBeats: (beatIds) => {
    const s = get();
    const idSet = new Set(beatIds);
    if (idSet.size === 0) return;

    const beats = s.beats.filter((b) => !idSet.has(b.id));
    const connections = s.connections.filter((c) => !c.beatIds.some((id) => idSet.has(id)));
    set({
      beats,
      connections,
      selection: s.selection.filter((item) => !(item.type === "beat" && idSet.has(item.id))),
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
let prevModelSnapshot = "";

function storeSnapshot(state: TimelineStore): string {
  return JSON.stringify({
    orientation: state.timelineOrientation,
    displayMode: state.displayMode,
    lanes: state.lanes,
    beats: state.beats,
    connections: state.connections,
    documents: state.documents,
    importLabelPrefixes: state.importLabelPrefixes,
    beatWidthPercent: state.beatWidthPercent,
    expandedBeatHeightPx: state.expandedBeatHeightPx,
    beatTextScalePercent: state.beatTextScalePercent,
  });
}

function modelSnapshot(state: TimelineStore): string {
  return JSON.stringify({
    lanes: state.lanes,
    beats: state.beats,
    connections: state.connections,
  });
}

useTimelineStore.subscribe((state) => {
  const modelSnap = modelSnapshot(state);
  if (modelSnap !== prevModelSnapshot) {
    prevModelSnapshot = modelSnap;
    const synced = syncDocumentsFromModel(
      state.documents,
      state.lanes,
      state.beats,
      state.dirtyDocumentIds
    );
    if (synced) {
      useTimelineStore.setState({ documents: synced });
    }
  }

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

export function getSelectedBeatIds(selection: TimelineSelectionItem[]): string[] {
  return selection.filter((s) => s.type === "beat").map((s) => s.id);
}
