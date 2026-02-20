import { create } from "zustand";

export interface Project {
  id: string;
  name: string;
  enabledModules: string[];
  lastOpened: number;
}

export interface Workspace {
  id: string;
  name: string;
  moduleType: string;
  attachedProjectId?: string;
  lastOpened: number;
}

interface AppStore {
  projects: Project[];
  workspaces: Workspace[];
  createProject: (name: string, enabledModules: string[]) => string;
  createWorkspace: (
    name: string,
    moduleType: string,
    attachedProjectId?: string
  ) => string;
  attachWorkspaceToProject: (workspaceId: string, projectId: string) => void;
  updateLastOpened: (
    type: "project" | "workspace",
    id: string
  ) => void;
}

const generateId = () => `_${Math.random().toString(36).slice(2, 11)}`;

export const useAppStore = create<AppStore>((set) => ({
  projects: [],
  workspaces: [],

  createProject: (name, enabledModules) => {
    const id = generateId();
    const project: Project = {
      id,
      name,
      enabledModules,
      lastOpened: Date.now(),
    };
    set((state) => ({
      projects: [project, ...state.projects],
    }));
    return id;
  },

  createWorkspace: (name, moduleType, attachedProjectId) => {
    const id = generateId();
    const workspace: Workspace = {
      id,
      name,
      moduleType,
      attachedProjectId,
      lastOpened: Date.now(),
    };
    set((state) => ({
      workspaces: [workspace, ...state.workspaces],
    }));
    return id;
  },

  attachWorkspaceToProject: (workspaceId, projectId) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, attachedProjectId: projectId } : w
      ),
    }));
  },

  updateLastOpened: (type, id) => {
    const now = Date.now();
    set((state) => {
      if (type === "project") {
        return {
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, lastOpened: now } : p
          ),
        };
      }
      return {
        workspaces: state.workspaces.map((w) =>
          w.id === id ? { ...w, lastOpened: now } : w
        ),
      };
    });
  },
}));
