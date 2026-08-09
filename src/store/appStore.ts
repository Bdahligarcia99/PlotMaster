import { create } from "zustand";
import { getStorageDriver } from "../storage/StorageDriver";

const APP_STORAGE_KEY = "synapse-iwe:app";
const LEGACY_APP_STORAGE_KEY = "plotmaster:app";

export interface Project {
  id: string;
  name: string;
  enabledModules: string[];
  /** Maps module type name (e.g. "Timeline") to sub-project id. */
  subProjects?: Record<string, string>;
  lastOpened: number;
  storageMode?: "localStorage" | "file";
  fileRef?: string;
}

export interface StandaloneProject {
  id: string;
  name: string;
  moduleType: string;
  lastOpened: number;
  storageMode?: "localStorage" | "file";
  fileRef?: string;
}

/** Maps driver moduleType to WorkspaceShell moduleType. */
const DRIVER_TO_STANDALONE_MODULE: Record<string, string> = {
  charts: "Charts",
  /** @deprecated legacy driver type */
  characterProfiles: "Charts",
  timeline: "Timeline",
  ideas: "Ideas",
};

/** Normalizes legacy module display names to current Charts naming. */
function normalizeModuleTypeName(name: string): string {
  if (name === "Profiles" || name === "Character Profiles") return "Charts";
  return name;
}

function normalizeModularProject(project: Project): Project {
  const enabledModules = project.enabledModules.map(normalizeModuleTypeName);
  const subProjects: Record<string, string> = {};
  for (const [key, value] of Object.entries(project.subProjects ?? {})) {
    subProjects[normalizeModuleTypeName(key)] = value;
  }
  return { ...project, enabledModules, subProjects };
}

function normalizeStandaloneProject(project: StandaloneProject): StandaloneProject {
  return { ...project, moduleType: normalizeModuleTypeName(project.moduleType) };
}

function loadFromStorage(): { modularProjects: Project[]; standaloneProjects: StandaloneProject[] } {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY) ?? localStorage.getItem(LEGACY_APP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const legacy = parsed.workspaces ?? [];
      const modularProjects: Project[] = (parsed.projects ?? parsed.modularProjects ?? []).map(
        normalizeModularProject
      );
      const standaloneProjects: StandaloneProject[] = (
        parsed.standaloneProjects ??
        legacy.map((w: { id: string; name: string; moduleType: string; lastOpened: number }) => ({
          id: w.id,
          name: w.name,
          moduleType: w.moduleType,
          lastOpened: w.lastOpened,
        }))
      ).map(normalizeStandaloneProject);
      return { modularProjects, standaloneProjects };
    }
  } catch {}
  return { modularProjects: [], standaloneProjects: [] };
}

interface AppStore {
  modularProjects: Project[];
  standaloneProjects: StandaloneProject[];
  introDialogOpen: boolean;
  createModularProject: (name: string, enabledModules: string[], subProjects?: Record<string, string>) => string;
  createStandaloneProject: (name: string, moduleType: string) => string;
  removeStandaloneProject: (id: string) => void;
  removeModularProject: (id: string) => void;
  /** Hydrate a project from the driver into standaloneProjects when opening from driver/recent. */
  ensureStandaloneFromDriver: (projectId: string) => Promise<StandaloneProject | null>;
  updateLastOpened: (
    type: "modular" | "standalone",
    id: string
  ) => void;
  setIntroDialogOpen: (open: boolean) => void;
}

const generateId = () => `_${Math.random().toString(36).slice(2, 11)}`;

function saveToStorage(modularProjects: Project[], standaloneProjects: StandaloneProject[]) {
  try {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ modularProjects, standaloneProjects }));
  } catch (e) {
    console.warn("[AppStore] Save failed:", e);
  }
}

const initialState = loadFromStorage();

export const useAppStore = create<AppStore>((set) => ({
  modularProjects: initialState.modularProjects,
  standaloneProjects: initialState.standaloneProjects,
  introDialogOpen: false,

  setIntroDialogOpen: (open) => set({ introDialogOpen: open }),

  createModularProject: (name, enabledModules, subProjects = {}) => {
    const id = generateId();
    const project: Project = {
      id,
      name,
      enabledModules,
      subProjects,
      lastOpened: Date.now(),
    };
    set((state) => {
      const next = { modularProjects: [project, ...state.modularProjects] };
      saveToStorage(next.modularProjects, state.standaloneProjects);
      return next;
    });
    return id;
  },

  createStandaloneProject: (name, moduleType) => {
    const id = generateId();
    const project: StandaloneProject = {
      id,
      name,
      moduleType,
      lastOpened: Date.now(),
    };
    set((state) => {
      const next = { standaloneProjects: [project, ...state.standaloneProjects] };
      saveToStorage(state.modularProjects, next.standaloneProjects);
      return next;
    });
    return id;
  },

  removeStandaloneProject: (id) => {
    set((state) => {
      const next = {
        standaloneProjects: state.standaloneProjects.filter((p) => p.id !== id),
      };
      saveToStorage(state.modularProjects, next.standaloneProjects);
      return next;
    });
  },

  removeModularProject: (id) => {
    set((state) => {
      const next = {
        modularProjects: state.modularProjects.filter((p) => p.id !== id),
      };
      saveToStorage(next.modularProjects, state.standaloneProjects);
      return next;
    });
  },

  ensureStandaloneFromDriver: async (projectId: string) => {
    const list = await getStorageDriver().listProjects();
    const driverProject = list.find((p) => p.id === projectId);
    if (!driverProject) return null;
    const moduleType = DRIVER_TO_STANDALONE_MODULE[driverProject.moduleType];
    if (!moduleType) return null; // familyTree uses /family-tree route, skip
    const standalone: StandaloneProject = {
      id: driverProject.id,
      name: driverProject.name,
      moduleType,
      lastOpened: driverProject.updatedAt,
    };
    set((state) => {
      if (state.standaloneProjects.some((p) => p.id === projectId)) return state;
      const next = { standaloneProjects: [standalone, ...state.standaloneProjects] };
      saveToStorage(state.modularProjects, next.standaloneProjects);
      return next;
    });
    return standalone;
  },

  updateLastOpened: (type, id) => {
    const now = Date.now();
    set((state) => {
      if (type === "modular") {
        const next = {
          modularProjects: state.modularProjects.map((p) =>
            p.id === id ? { ...p, lastOpened: now } : p
          ),
        };
        saveToStorage(next.modularProjects, state.standaloneProjects);
        return next;
      }
      const next = {
        standaloneProjects: state.standaloneProjects.map((p) =>
          p.id === id ? { ...p, lastOpened: now } : p
        ),
      };
      saveToStorage(state.modularProjects, next.standaloneProjects);
      return next;
    });
  },
}));
