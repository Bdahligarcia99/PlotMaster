import type { Node, Edge } from "reactflow";
import type { ConnectionStyleDef } from "../store/familyTreeStore";

/** Module types for project index. */
export type ProjectModuleType =
  | "familyTree"
  | "timeline"
  | "characterProfiles"
  | "ideas";

/** Project index entry. */
export interface ProjectIndexItem {
  id: string;
  name: string;
  moduleType: ProjectModuleType;
  createdAt: number;
  updatedAt: number;
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

/** Project payload (family tree). */
export interface ProjectPayload {
  version: 1;
  moduleType: "familyTree";
  nodes: Node<unknown>[];
  edges: Edge[];
  anchorNodeId: string | null;
  generationAnchors?: GenerationAnchor[];
  connectionStyles?: ConnectionStyleDef[];
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
}

export interface TimelineBeatRecord {
  id: string;
  laneId: string;
  order: number;
  kind?: "story" | "empty";
  title: string;
  description: string;
  date: string;
}

/** Crossing connector: an additive visual link between N beats (never a graph node/hub). */
export interface TimelineConnectionRecord {
  id: string;
  beatIds: string[];
  title: string;
  description: string;
  date: string;
}

export interface TimelineProjectPayload {
  version: 1;
  moduleType: "timeline";
  timelineOrientation: TimelineOrientation;
  lanes?: TimelineLaneRecord[];
  beats?: TimelineBeatRecord[];
  connections?: TimelineConnectionRecord[];
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
    patch: Partial<Pick<ProjectIndexItem, "name" | "updatedAt">>
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
    patch: Partial<Pick<ProjectIndexItem, "name" | "updatedAt">>
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

let driver: StorageDriver | null = null;

/** Get the storage driver (LocalStorage for now, Tauri-ready later). */
export function getStorageDriver(): StorageDriver {
  if (!driver) driver = new LocalStorageDriver();
  return driver;
}
