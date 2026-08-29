import { create } from "zustand";
import { instrument } from "../logging/instrumentStore";
import { getStorageDriver } from "../storage/StorageDriver";
import type {
  NeuronDocumentRecord,
  NeuronFolderRecord,
  NeuronIconRef,
  NeuronProjectPayload,
  ProjectData,
} from "../storage/StorageDriver";

const generateId = () => `_${Math.random().toString(36).slice(2, 11)}`;

export function createDefaultNeuronPayload(ownerProjectId?: string): NeuronProjectPayload {
  return {
    version: 1,
    moduleType: "neuron",
    ownerProjectId,
    folders: [],
    documents: [],
    mirrorMeta: {},
  };
}

export interface NeuronMirrorMeta {
  icon?: NeuronIconRef;
  synopsis?: string;
  notes?: string;
}

interface NeuronStore {
  activeProjectId: string | null;
  projectName: string;
  ownerProjectId: string | null;
  folders: NeuronFolderRecord[];
  documents: NeuronDocumentRecord[];
  mirrorMeta: Record<string, NeuronMirrorMeta>;
  /** Loaded sibling module payloads keyed by sub-project id. */
  mirrors: Record<string, ProjectData>;
  activeFolderId: string | null;
  selection: { kind: "folder" | "document" | "mirror"; id: string; mirrorKey?: string } | null;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  lastSaveError: string | null;
  loading: boolean;

  loadProject: (projectId: string) => Promise<boolean>;
  saveProject: () => Promise<boolean>;
  setProjectName: (name: string) => void;
  setMirrors: (mirrors: Record<string, ProjectData>) => void;
  updateMirror: (subId: string, payload: ProjectData) => void;
  setActiveFolderId: (folderId: string | null) => void;
  setSelection: (sel: NeuronStore["selection"]) => void;

  createFolder: (name: string, parentId?: string | null) => string;
  renameFolder: (folderId: string, name: string) => void;
  deleteFolder: (folderId: string) => void;
  moveFolder: (folderId: string, newParentId: string | null) => void;

  createDocument: (name?: string, folderId?: string | null) => string;
  renameDocument: (docId: string, name: string) => void;
  deleteDocument: (docId: string) => void;
  moveDocument: (docId: string, folderId: string | null) => void;
  applyDocumentEdits: (docId: string, content: string) => void;

  setFolderIcon: (folderId: string, icon: NeuronIconRef | undefined) => void;
  setDocumentIcon: (docId: string, icon: NeuronIconRef | undefined) => void;
  setFolderSynopsis: (folderId: string, synopsis: string) => void;
  setDocumentSynopsis: (docId: string, synopsis: string) => void;
  setFolderNotes: (folderId: string, notes: string) => void;
  setDocumentNotes: (docId: string, notes: string) => void;

  setMirrorMeta: (mirrorKey: string, patch: Partial<NeuronMirrorMeta>) => void;
  getMirrorMeta: (mirrorKey: string) => NeuronMirrorMeta;
}

let saveDebounce: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 500;
let prevSnapshot: string | null = null;

function storeSnapshot(state: NeuronStore): string {
  return JSON.stringify({
    folders: state.folders,
    documents: state.documents,
    mirrorMeta: state.mirrorMeta,
  });
}

function sortByOrder<T extends { sortOrder: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

function nextSortOrder(items: { sortOrder: number }[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((i) => i.sortOrder)) + 1;
}

export const useNeuronStore = create<NeuronStore>(instrument("neuron", (set, get) => ({
  activeProjectId: null,
  projectName: "Untitled",
  ownerProjectId: null,
  folders: [],
  documents: [],
  mirrorMeta: {},
  mirrors: {},
  activeFolderId: null,
  selection: null,
  hasUnsavedChanges: false,
  isSaving: false,
  lastSaveError: null,
  loading: false,

  loadProject: async (projectId) => {
    set({ loading: true, activeProjectId: projectId });
    try {
      const driver = getStorageDriver();
      const list = await driver.listProjects();
      const meta = list.find((p) => p.id === projectId);
      const raw = await driver.loadProjectData(projectId);
      const payload =
        raw?.moduleType === "neuron" ? raw : createDefaultNeuronPayload();
      set({
        projectName: meta?.name ?? "Neuron",
        ownerProjectId: payload.ownerProjectId ?? null,
        folders: payload.folders ?? [],
        documents: payload.documents ?? [],
        mirrorMeta: payload.mirrorMeta ?? {},
        activeFolderId: payload.folders?.[0]?.id ?? null,
        hasUnsavedChanges: false,
        loading: false,
      });
      return true;
    } catch (e) {
      console.error("[neuronStore] load failed:", e);
      set({ loading: false });
      return false;
    }
  },

  saveProject: async () => {
    const s = get();
    if (!s.activeProjectId) return false;
    set({ isSaving: true, lastSaveError: null });
    try {
      const driver = getStorageDriver();
      const payload: NeuronProjectPayload = {
        version: 1,
        moduleType: "neuron",
        ownerProjectId: s.ownerProjectId ?? undefined,
        folders: s.folders,
        documents: s.documents,
        mirrorMeta: s.mirrorMeta,
      };
      await driver.saveProjectData(s.activeProjectId, payload);
      await driver.updateProjectMeta(s.activeProjectId, { updatedAt: Date.now() });
      set({ hasUnsavedChanges: false, isSaving: false });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      set({ isSaving: false, lastSaveError: msg });
      return false;
    }
  },

  setProjectName: (name) => {
    set({ projectName: name, hasUnsavedChanges: true });
  },

  setMirrors: (mirrors) => set({ mirrors }),

  updateMirror: (subId, payload) => {
    set((s) => ({
      mirrors: { ...s.mirrors, [subId]: payload },
    }));
  },

  setActiveFolderId: (folderId) => set({ activeFolderId: folderId }),

  setSelection: (sel) => set({ selection: sel }),

  createFolder: (name, parentId = null) => {
    const id = generateId();
    const siblings = get().folders.filter((f) => f.parentId === parentId);
    const folder: NeuronFolderRecord = {
      id,
      name: name.trim() || "New Folder",
      parentId,
      sortOrder: nextSortOrder(siblings),
    };
    set((s) => ({
      folders: [...s.folders, folder],
      activeFolderId: id,
      hasUnsavedChanges: true,
    }));
    return id;
  },

  renameFolder: (folderId, name) => {
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === folderId ? { ...f, name: name.trim() || f.name } : f
      ),
      hasUnsavedChanges: true,
    }));
  },

  deleteFolder: (folderId) => {
    set((s) => {
      const toDelete = new Set<string>([folderId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const f of s.folders) {
          if (f.parentId && toDelete.has(f.parentId) && !toDelete.has(f.id)) {
            toDelete.add(f.id);
            changed = true;
          }
        }
      }
      return {
        folders: s.folders.filter((f) => !toDelete.has(f.id)),
        documents: s.documents.filter((d) => !d.folderId || !toDelete.has(d.folderId)),
        hasUnsavedChanges: true,
      };
    });
  },

  moveFolder: (folderId, newParentId) => {
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === folderId ? { ...f, parentId: newParentId } : f
      ),
      hasUnsavedChanges: true,
    }));
  },

  createDocument: (name, folderId) => {
    const id = generateId();
    const fid = folderId ?? get().activeFolderId ?? null;
    const siblings = get().documents.filter((d) => d.folderId === fid);
    const now = Date.now();
    const doc: NeuronDocumentRecord = {
      id,
      name: name?.trim() || "Untitled",
      content: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
      folderId: fid,
      sortOrder: nextSortOrder(siblings),
      updatedAt: now,
    };
    set((s) => ({
      documents: [...s.documents, doc],
      hasUnsavedChanges: true,
    }));
    return id;
  },

  renameDocument: (docId, name) => {
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId ? { ...d, name: name.trim() || d.name, updatedAt: Date.now() } : d
      ),
      hasUnsavedChanges: true,
    }));
  },

  deleteDocument: (docId) => {
    set((s) => ({
      documents: s.documents.filter((d) => d.id !== docId),
      hasUnsavedChanges: true,
    }));
  },

  moveDocument: (docId, folderId) => {
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId ? { ...d, folderId, updatedAt: Date.now() } : d
      ),
      hasUnsavedChanges: true,
    }));
  },

  applyDocumentEdits: (docId, content) => {
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId ? { ...d, content, updatedAt: Date.now() } : d
      ),
      hasUnsavedChanges: true,
    }));
  },

  setFolderIcon: (folderId, icon) => {
    set((s) => ({
      folders: s.folders.map((f) => (f.id === folderId ? { ...f, icon } : f)),
      hasUnsavedChanges: true,
    }));
  },

  setDocumentIcon: (docId, icon) => {
    set((s) => ({
      documents: s.documents.map((d) => (d.id === docId ? { ...d, icon } : d)),
      hasUnsavedChanges: true,
    }));
  },

  setFolderSynopsis: (folderId, synopsis) => {
    set((s) => ({
      folders: s.folders.map((f) => (f.id === folderId ? { ...f, synopsis } : f)),
      hasUnsavedChanges: true,
    }));
  },

  setDocumentSynopsis: (docId, synopsis) => {
    set((s) => ({
      documents: s.documents.map((d) => (d.id === docId ? { ...d, synopsis } : d)),
      hasUnsavedChanges: true,
    }));
  },

  setFolderNotes: (folderId, notes) => {
    set((s) => ({
      folders: s.folders.map((f) => (f.id === folderId ? { ...f, notes } : f)),
      hasUnsavedChanges: true,
    }));
  },

  setDocumentNotes: (docId, notes) => {
    set((s) => ({
      documents: s.documents.map((d) => (d.id === docId ? { ...d, notes } : d)),
      hasUnsavedChanges: true,
    }));
  },

  setMirrorMeta: (mirrorKey, patch) => {
    set((s) => ({
      mirrorMeta: {
        ...s.mirrorMeta,
        [mirrorKey]: { ...s.mirrorMeta[mirrorKey], ...patch },
      },
      hasUnsavedChanges: true,
    }));
  },

  getMirrorMeta: (mirrorKey) => {
    return get().mirrorMeta[mirrorKey] ?? {};
  },
})));

export { sortByOrder };

useNeuronStore.subscribe((state) => {
  const snapshot = storeSnapshot(state);
  const changed = snapshot !== prevSnapshot;
  prevSnapshot = snapshot;

  if (changed && state.activeProjectId && state.hasUnsavedChanges) {
    if (saveDebounce) clearTimeout(saveDebounce);
    saveDebounce = setTimeout(() => {
      const s = useNeuronStore.getState();
      if (s.activeProjectId && s.hasUnsavedChanges) {
        void s.saveProject();
      }
      saveDebounce = null;
    }, SAVE_DEBOUNCE_MS);
  }
});
