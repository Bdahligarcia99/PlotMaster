import type { Node, Edge } from "reactflow";

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
  showNodeInfoEnabled?: boolean;
  nodeInfoTopLeft?: boolean;
  nodeInfoCenter?: boolean;
  nodeInfoSize?: boolean;
  singleChildAlignment?: "left" | "center" | "right";
  childrenRowAlignment3Plus?: "left" | "center" | "right";
  persistUnionSelectionOnChildCreate?: boolean;
  scriptPanelLayout?: "split" | "codeOnly" | "viewOnly";
}

/** Project payload (family tree). */
export interface ProjectPayload {
  version: 1;
  moduleType: "familyTree";
  nodes: Node<unknown>[];
  edges: Edge[];
  anchorNodeId: string | null;
  ui?: FamilyTreeUIFlags;
}

/** Storage driver interface - web/localStorage now, Tauri-ready later. */
export interface StorageDriver {
  listProjects(): Promise<ProjectIndexItem[]>;
  createProject(item: ProjectIndexItem): Promise<void>;
  updateProjectMeta(
    projectId: string,
    patch: Partial<Pick<ProjectIndexItem, "name" | "updatedAt">>
  ): Promise<void>;
  saveProjectData(projectId: string, payload: ProjectPayload): Promise<void>;
  loadProjectData(projectId: string): Promise<ProjectPayload | null>;
  deleteProject(projectId: string): Promise<void>;
}

const INDEX_KEY = "plotmaster:projects:index";
const DATA_KEY = (projectId: string) => `plotmaster:project:data:${projectId}`;

/** LocalStorage implementation. */
class LocalStorageDriver implements StorageDriver {
  async listProjects(): Promise<ProjectIndexItem[]> {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
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

  async saveProjectData(projectId: string, payload: ProjectPayload): Promise<void> {
    try {
      localStorage.setItem(DATA_KEY(projectId), JSON.stringify(payload));
    } catch (e) {
      console.warn("[StorageDriver] Save failed:", e);
      throw e;
    }
  }

  async loadProjectData(projectId: string): Promise<ProjectPayload | null> {
    try {
      const raw = localStorage.getItem(DATA_KEY(projectId));
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
    } catch {}
  }
}

let driver: StorageDriver | null = null;

/** Get the storage driver (LocalStorage for now, Tauri-ready later). */
export function getStorageDriver(): StorageDriver {
  if (!driver) driver = new LocalStorageDriver();
  return driver;
}
