import type { ProjectData, ProjectIndexItem, StorageDriver } from "../StorageDriver";
import {
  loadModulePayloadFromFile,
  resolveFileRefForProject,
  saveModulePayloadToFile,
} from "./synprojProjectService";
import type { AnyModulePayload } from "./synprojFormat";

const INDEX_KEY = "synapse-iwe:projects:index";
const LEGACY_INDEX_KEY = "plotmaster:projects:index";
const DATA_KEY = (projectId: string) => `synapse-iwe:project:data:${projectId}`;
const LEGACY_DATA_KEY = (projectId: string) => `plotmaster:project:data:${projectId}`;

async function readIndex(): Promise<ProjectIndexItem[]> {
  try {
    const raw = localStorage.getItem(INDEX_KEY) ?? localStorage.getItem(LEGACY_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeIndex(list: ProjectIndexItem[]): Promise<void> {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

/**
 * Storage driver that reads/writes module payloads through a .synproj file.
 * Falls back to localStorage index/meta operations for project listing.
 */
export class FileBackedStorageDriver implements StorageDriver {
  async listProjects(): Promise<ProjectIndexItem[]> {
    return readIndex();
  }

  async createProject(item: ProjectIndexItem): Promise<void> {
    const list = await readIndex();
    if (list.some((p) => p.id === item.id)) return;
    await writeIndex([item, ...list]);
  }

  async updateProjectMeta(
    projectId: string,
    patch: Partial<Pick<ProjectIndexItem, "name" | "updatedAt" | "storageMode" | "fileRef">>
  ): Promise<void> {
    const list = await readIndex();
    const idx = list.findIndex((p) => p.id === projectId);
    if (idx < 0) return;
    list[idx] = { ...list[idx], ...patch };
    await writeIndex(list);
  }

  async saveProjectData(projectId: string, payload: ProjectData): Promise<void> {
    const fileRef = await resolveFileRefForProject(projectId);
    if (fileRef) {
      await saveModulePayloadToFile(projectId, payload as AnyModulePayload);
    }
    // Mirror to localStorage as fallback backup (per spec: keep localStorage copy)
    try {
      localStorage.setItem(DATA_KEY(projectId), JSON.stringify(payload));
    } catch (e) {
      console.warn("[FileBackedStorageDriver] localStorage mirror save failed:", e);
    }
  }

  async loadProjectData(projectId: string): Promise<ProjectData | null> {
    const fileRef = await resolveFileRefForProject(projectId);
    if (fileRef) {
      try {
        const payload = await loadModulePayloadFromFile(projectId);
        if (payload && "moduleType" in payload) {
          if (payload.moduleType === "familyTree" || payload.moduleType === "timeline") {
            return payload as ProjectData;
          }
        }
      } catch (e) {
        console.warn("[FileBackedStorageDriver] File load failed, falling back to localStorage:", e);
      }
    }
    try {
      const raw = localStorage.getItem(DATA_KEY(projectId)) ?? localStorage.getItem(LEGACY_DATA_KEY(projectId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    const list = await readIndex();
    await writeIndex(list.filter((p) => p.id !== projectId));
    try {
      localStorage.removeItem(DATA_KEY(projectId));
      localStorage.removeItem(LEGACY_DATA_KEY(projectId));
    } catch { /* ignore */ }
  }
}
