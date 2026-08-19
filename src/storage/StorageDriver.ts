import type { Node, Edge } from "reactflow";
import type { ConnectionStyleDef } from "../store/familyTreeStore";
import { resolveFileRefForProject } from "./synproj/synprojProjectService";
import { FileBackedStorageDriver } from "./synproj/FileBackedStorageDriver";

/** Module types for project index. */
export type ProjectModuleType =
  | "familyTree"
  | "timeline"
  | "charts"
  | "ideas";

/** Project index entry. */
export interface ProjectIndexItem {
  id: string;
  name: string;
  moduleType: ProjectModuleType;
  createdAt: number;
  updatedAt: number;
  /** When "file", module data is stored in a .synproj file at fileRef. */
  storageMode?: "localStorage" | "file";
  /** Path (Tauri) or web handle token for the .synproj file. */
  fileRef?: string;
}

/** Family tree UI flags. */
export interface FamilyTreeUIFlags {
  snapToGrid?: boolean;
  showCoordinates?: boolean;
  showCoordinatesEnabled?: boolean;
  /** @deprecated Use nodeInfoTopLeft */
  coordModeTopLeft?: boolean;
  /** @deprecated Use nodeInfoCenter */
  coordModeCenter?: boolean;
  showNodeInfoEnabled?: boolean;
  nodeInfoTopLeft?: boolean;
  nodeInfoCenter?: boolean;
  nodeInfoSize?: boolean;
  nodeInfoSpacing?: boolean;
  singleChildAlignment?: "left" | "center" | "right";
  childrenRowAlignment3Plus?: "left" | "center" | "right";
  persistUnionSelectionOnChildCreate?: boolean;
  scriptPanelLayout?: "split" | "codeOnly" | "viewOnly";
  genLabelMode?: "letters" | "numbers" | "both";
  showGenerationAnchors?: boolean;
  showGenInheritIndicator?: boolean;
  genAnchorBandOpacity?: number;
  genAnchorLineOpacity?: number;
  defaultUnionType?: "forward" | "backward";
}

/** Generation anchor for family tree. */
export interface GenerationAnchor {
  id: string;
  index: number;
  yTop: number;
  height: number;
  customLabel?: string;
}

/** Persisted family tab — explicit union and person membership. */
export interface PersistedFamilyRecord {
  id: string;
  unionIds: string[];
  /** Persons explicitly assigned to this family without requiring a union. */
  personIds?: string[];
  name: string;
  isCustomName: boolean;
  description: string;
  parentFamilyIds?: [string, string];
}

/** Persisted branch — downward subtree from a root person. */
export interface PersistedBranchRecord {
  id: string;
  name: string;
  description: string;
  mode: "hidden" | "tab";
  rootPersonId: string;
  familyId: string | null;
  createdAt: number;
}

/** Plain text file in Family Tree Script display mode. */
export interface PersistedFamilyTreeDocumentRecord {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
  /** Owning family tab id; null = legacy/unassigned bucket. */
  familyId?: string | null;
  /** main = regular family file; unassigned = auto-managed orphan/cluster file. */
  role?: "main" | "unassigned";
}

/** Project payload (family tree). */
export interface ProjectPayload {
  version: 1;
  moduleType: "familyTree";
  displayMode?: "nodes" | "text";
  nodes: Node<unknown>[];
  edges: Edge[];
  anchorNodeId: string | null;
  generationAnchors?: GenerationAnchor[];
  connectionStyles?: ConnectionStyleDef[];
  /** Persisted family tabs with frozen union membership. */
  families?: PersistedFamilyRecord[];
  /** Persisted branches (hidden groups and branch tabs). */
  branches?: PersistedBranchRecord[];
  /** Script display mode text files (family grouping is derived, not stored). */
  documents?: PersistedFamilyTreeDocumentRecord[];
  /** @deprecated Read-only migration source; use `families` instead. */
  customFamilyNames?: { unionIds: string[]; name: string; description?: string }[];
  ui?: FamilyTreeUIFlags;
}

/** Timeline axis orientation (per project). */
export type TimelineOrientation = "vertical" | "horizontal";

/** Project payload (timeline outliner). */
export interface TimelineLaneRecord {
  id: string;
  label: string;
  laneType: string;
  sortOrder: number;
  color?: string;
}

export interface TimelineBeatRecord {
  id: string;
  laneId: string;
  /** Absolute slot on the shared slot grid (current format). */
  slot?: number;
  /** Legacy field name from the pre-slot-grid format — read as a fallback when `slot` is absent. */
  order?: number;
  /** "empty" only ever appears in legacy data; the slot grid replaced spacer beats entirely. */
  kind?: "story" | "empty" | "anchor";
  title: string;
  /** Legacy field — migrated to detail on load. */
  description?: string;
  synopsis?: string;
  detail?: string;
  /** Legacy freeform date string — migrated to dateSpec on load. */
  date?: string;
  dateSpec?: {
    mode: "none" | "label" | "absolute" | "relative" | "resolved";
    label?: string;
    absolute?: string;
    relative?: { years: number; months: number; days: number; originBeatId: string };
    resolved?: string;
  };
  /** Legacy anchor-ghost fields, read (and discarded) for backward compatibility only. */
  anchorId?: string;
  ghostSide?: "above" | "below";
}

/** Crossing connector: an additive visual link between N beats (never a graph node/hub). */
export interface TimelineConnectionRecord {
  id: string;
  beatIds: string[];
  title: string;
  description: string;
  date: string;
  color?: string;
}

/** Outline folder grouping text files into a single outline. */
export interface TimelineFolderRecord {
  id: string;
  name: string;
  sortOrder: number;
}

/** Plain text file in Timeline Text display mode (no ongoing lane ownership). */
export interface TimelineDocumentRecord {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
  /** Outline folder this file belongs to (required once folders exist). */
  folderId?: string;
  /** @deprecated Read-only migration field — legacy derived lane files. Never written on save. */
  kind?: "user" | "derived";
  /** @deprecated Read-only migration field — legacy derived lane id. Never written on save. */
  laneId?: string;
}

export interface TimelineProjectPayload {
  version: 1;
  moduleType: "timeline";
  timelineOrientation: TimelineOrientation;
  displayMode?: "block" | "text";
  lanes?: TimelineLaneRecord[];
  beats?: TimelineBeatRecord[];
  connections?: TimelineConnectionRecord[];
  importLabelPrefixes?: string[];
  folders?: TimelineFolderRecord[];
  activeFolderId?: string | null;
  documents?: TimelineDocumentRecord[];
  beatWidthPercent?: number;
  expandedBeatHeightPx?: number;
  beatTextScalePercent?: number;
}

export type ProjectData = ProjectPayload | TimelineProjectPayload;

export function isTimelineProjectPayload(
  payload: ProjectData | null | undefined
): payload is TimelineProjectPayload {
  return payload?.moduleType === "timeline";
}

/** Storage driver interface - web/localStorage now, Tauri-ready later. */
export interface StorageDriver {
  listProjects(): Promise<ProjectIndexItem[]>;
  createProject(item: ProjectIndexItem): Promise<void>;
  updateProjectMeta(
    projectId: string,
    patch: Partial<Pick<ProjectIndexItem, "name" | "updatedAt" | "storageMode" | "fileRef">>
  ): Promise<void>;
  saveProjectData(projectId: string, payload: ProjectData): Promise<void>;
  loadProjectData(projectId: string): Promise<ProjectData | null>;
  deleteProject(projectId: string): Promise<void>;
}

const INDEX_KEY = "synapse-iwe:projects:index";
const DATA_KEY = (projectId: string) => `synapse-iwe:project:data:${projectId}`;
const LEGACY_INDEX_KEY = "plotmaster:projects:index";
const LEGACY_DATA_KEY = (projectId: string) => `plotmaster:project:data:${projectId}`;

/** LocalStorage implementation. */
class LocalStorageDriver implements StorageDriver {
  async listProjects(): Promise<ProjectIndexItem[]> {
    try {
      const raw = localStorage.getItem(INDEX_KEY) ?? localStorage.getItem(LEGACY_INDEX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async createProject(item: ProjectIndexItem): Promise<void> {
    const list = await this.listProjects();
    if (list.some((p) => p.id === item.id)) return;
    const next = [item, ...list];
    localStorage.setItem(INDEX_KEY, JSON.stringify(next));
  }

  async updateProjectMeta(
    projectId: string,
    patch: Partial<Pick<ProjectIndexItem, "name" | "updatedAt" | "storageMode" | "fileRef">>
  ): Promise<void> {
    const list = await this.listProjects();
    const idx = list.findIndex((p) => p.id === projectId);
    if (idx < 0) return;
    list[idx] = { ...list[idx], ...patch };
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn("[StorageDriver] Update meta failed:", e);
      throw e;
    }
  }

  async saveProjectData(projectId: string, payload: ProjectData): Promise<void> {
    try {
      localStorage.setItem(DATA_KEY(projectId), JSON.stringify(payload));
    } catch (e) {
      console.warn("[StorageDriver] Save failed:", e);
      throw e;
    }
  }

  async loadProjectData(projectId: string): Promise<ProjectData | null> {
    try {
      const raw = localStorage.getItem(DATA_KEY(projectId)) ?? localStorage.getItem(LEGACY_DATA_KEY(projectId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    const list = await this.listProjects();
    const next = list.filter((p) => p.id !== projectId);
    localStorage.setItem(INDEX_KEY, JSON.stringify(next));
    try {
      localStorage.removeItem(DATA_KEY(projectId));
      localStorage.removeItem(LEGACY_DATA_KEY(projectId));
    } catch {}
  }
}

/** Delegates to file-backed or localStorage driver per project. */
class HybridStorageDriver implements StorageDriver {
  private local = new LocalStorageDriver();
  private file = new FileBackedStorageDriver();

  private async isFileBacked(projectId: string): Promise<boolean> {
    return (await resolveFileRefForProject(projectId)) != null;
  }

  listProjects(): Promise<ProjectIndexItem[]> {
    return this.local.listProjects();
  }

  createProject(item: ProjectIndexItem): Promise<void> {
    return this.local.createProject(item);
  }

  updateProjectMeta(
    projectId: string,
    patch: Partial<Pick<ProjectIndexItem, "name" | "updatedAt" | "storageMode" | "fileRef">>
  ): Promise<void> {
    return this.local.updateProjectMeta(projectId, patch);
  }

  async saveProjectData(projectId: string, payload: ProjectData): Promise<void> {
    if (await this.isFileBacked(projectId)) {
      return this.file.saveProjectData(projectId, payload);
    }
    return this.local.saveProjectData(projectId, payload);
  }

  async loadProjectData(projectId: string): Promise<ProjectData | null> {
    if (await this.isFileBacked(projectId)) {
      return this.file.loadProjectData(projectId);
    }
    return this.local.loadProjectData(projectId);
  }

  deleteProject(projectId: string): Promise<void> {
    return this.local.deleteProject(projectId);
  }
}

let driver: StorageDriver | null = null;

/** Get the storage driver (Hybrid: localStorage + .synproj file-backed). */
export function getStorageDriver(): StorageDriver {
  if (!driver) driver = new HybridStorageDriver();
  return driver;
}
