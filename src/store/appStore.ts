import { create } from "zustand";

const APP_STORAGE_KEY = "plotmaster:app";

export interface Project {
  id: string;
  name: string;
  enabledModules: string[];
  lastOpened: number;
}

export interface StandaloneProject {
  id: string;
  name: string;
  moduleType: string;
  lastOpened: number;
}

interface AppStore {
  modularProjects: Project[];
  standaloneProjects: StandaloneProject[];
  createModularProject: (name: string, enabledModules: string[]) => string;
  createStandaloneProject: (name: string, moduleType: string) => string;
  removeStandaloneProject: (id: string) => void;
  updateLastOpened: (
    type: "modular" | "standalone",
    id: string
  ) => void;
}

const generateId = () => `_${Math.random().toString(36).slice(2, 11)}`;

function loadFromStorage(): { modularProjects: Project[]; standaloneProjects: StandaloneProject[] } {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const legacy = parsed.workspaces ?? [];
      return {
        modularProjects: parsed.projects ?? parsed.modularProjects ?? [],
        standaloneProjects: parsed.standaloneProjects ?? legacy.map((w: { id: string; name: string; moduleType: string; lastOpened: number }) => ({
          id: w.id,
          name: w.name,
          moduleType: w.moduleType,
          lastOpened: w.lastOpened,
        })),
      };
    }
  } catch {}
  return { modularProjects: [], standaloneProjects: [] };
}

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

  createModularProject: (name, enabledModules) => {
    const id = generateId();
    const project: Project = {
      id,
      name,
      enabledModules,
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
