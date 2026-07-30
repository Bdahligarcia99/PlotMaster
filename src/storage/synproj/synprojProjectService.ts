import { getStorageDriver, type ProjectIndexItem, type ProjectModuleType } from "../StorageDriver";
import { useAppStore, type Project, type StandaloneProject } from "../../store/appStore";
import { getModuleRoute } from "../../home/moduleRoutes";
import {
  isCharacterProfilesPayload,
  serializeSynprojFile,
  type AnyModulePayload,
  type CharacterProfilesPayload,
  type SynprojFile,
} from "./synprojFormat";
import { getSynprojFileIO } from "./synprojFileIO";

const FILE_REF_REGISTRY_KEY = "synapse-iwe:projects:fileRefs";

/** Maps project/module id -> fileRef for quick lookup. */
interface FileRefRegistry {
  [projectId: string]: string;
}

function loadFileRefRegistry(): FileRefRegistry {
  try {
    const raw = localStorage.getItem(FILE_REF_REGISTRY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveFileRefRegistry(registry: FileRefRegistry): void {
  try {
    localStorage.setItem(FILE_REF_REGISTRY_KEY, JSON.stringify(registry));
  } catch (e) {
    console.warn("[Synproj] Failed to save file ref registry:", e);
  }
}

export function registerProjectFileRef(projectId: string, fileRef: string): void {
  const registry = loadFileRefRegistry();
  registry[projectId] = fileRef;
  saveFileRefRegistry(registry);
}

export function unregisterProjectFileRef(projectId: string): void {
  const registry = loadFileRefRegistry();
  delete registry[projectId];
  saveFileRefRegistry(registry);
}

/** Resolve the .synproj fileRef for a module/sub-project id. */
export async function resolveFileRefForProject(projectId: string): Promise<string | null> {
  const registry = loadFileRefRegistry();
  if (registry[projectId]) return registry[projectId];

  const driver = getStorageDriver();
  const index = await driver.listProjects();
  const entry = index.find((p) => p.id === projectId);
  if (entry?.fileRef) return entry.fileRef;

  const appState = useAppStore.getState();
  for (const mp of appState.modularProjects) {
    if (mp.fileRef) {
      const subIds = Object.values(mp.subProjects ?? {});
      if (subIds.includes(projectId)) return mp.fileRef;
    }
  }
  const standalone = appState.standaloneProjects.find((p) => p.id === projectId);
  if (standalone?.fileRef) return standalone.fileRef;

  return null;
}

export async function isFileBackedProject(projectId: string): Promise<boolean> {
  return (await resolveFileRefForProject(projectId)) != null;
}

export async function readSynprojForProject(projectId: string): Promise<SynprojFile | null> {
  const fileRef = await resolveFileRefForProject(projectId);
  if (!fileRef) return null;
  return getSynprojFileIO().read(fileRef);
}

export async function writeSynprojForProject(projectId: string, data: SynprojFile): Promise<void> {
  const fileRef = await resolveFileRefForProject(projectId);
  if (!fileRef) throw new Error("No file reference for project");
  await getSynprojFileIO().write(fileRef, data);
}

export async function loadModulePayloadFromFile(projectId: string): Promise<AnyModulePayload | null> {
  const file = await readSynprojForProject(projectId);
  if (!file) return null;
  return file.modules[projectId] ?? null;
}

export async function saveModulePayloadToFile(
  projectId: string,
  payload: AnyModulePayload
): Promise<void> {
  const fileRef = await resolveFileRefForProject(projectId);
  if (!fileRef) throw new Error("No file reference for project");
  const io = getSynprojFileIO();
  const file = await io.read(fileRef);
  file.modules[projectId] = payload;
  await io.write(fileRef, file);
}

/** Build profiles payload from localStorage (for conversion). */
export function buildProfilesPayloadFromLocalStorage(projectId: string): CharacterProfilesPayload {
  const charsKey = `synapse-iwe:profiles:${projectId}`;
  const templatesKey = `synapse-iwe:profiles:templates:${projectId}`;
  const layoutKey = `synapse-iwe:profiles:chartSectionLayout:${projectId}`;
  let characters: CharacterProfilesPayload["characters"] = [];
  let templates: CharacterProfilesPayload["templates"] = [];
  let chartSectionLayout: CharacterProfilesPayload["chartSectionLayout"];
  try {
    const rawChars = localStorage.getItem(charsKey) ?? localStorage.getItem(`plotmaster:profiles:${projectId}`);
    characters = rawChars ? JSON.parse(rawChars) : [];
  } catch { /* empty */ }
  try {
    const rawTemplates = localStorage.getItem(templatesKey) ?? localStorage.getItem(`plotmaster:profiles:templates:${projectId}`);
    templates = rawTemplates ? JSON.parse(rawTemplates) : [];
  } catch { /* empty */ }
  try {
    const rawLayout = localStorage.getItem(layoutKey) ?? localStorage.getItem(`plotmaster:profiles:chartSectionLayout:${projectId}`);
    if (rawLayout === "grid" || rawLayout === "list") chartSectionLayout = rawLayout;
  } catch { /* empty */ }
  return {
    version: 1,
    moduleType: "characterProfiles",
    characters,
    templates,
    chartSectionLayout,
  };
}

export async function buildSynprojSnapshotForModularProject(
  modularProject: Project
): Promise<SynprojFile> {
  const driver = getStorageDriver();
  const modules: Record<string, AnyModulePayload> = {};
  const subProjects = modularProject.subProjects ?? {};
  for (const moduleId of Object.values(subProjects)) {
    const payload = await driver.loadProjectData(moduleId);
    if (payload) {
      modules[moduleId] = payload;
    } else {
      const profilesPayload = buildProfilesPayloadFromLocalStorage(moduleId);
      if (profilesPayload.characters.length > 0 || profilesPayload.templates.length > 0) {
        modules[moduleId] = profilesPayload;
      }
    }
  }
  return {
    formatVersion: 1,
    savedAt: Date.now(),
    project: {
      id: modularProject.id,
      name: modularProject.name,
      kind: "modular",
      enabledModules: modularProject.enabledModules,
      subProjects,
    },
    modules,
  };
}

export async function buildSynprojSnapshotForStandalone(
  projectId: string,
  name: string,
  moduleType: string
): Promise<SynprojFile> {
  const driver = getStorageDriver();
  const modules: Record<string, AnyModulePayload> = {};
  const payload = await driver.loadProjectData(projectId);
  if (payload) {
    modules[projectId] = payload;
  } else if (moduleType === "Profiles" || moduleType === "characterProfiles") {
    modules[projectId] = buildProfilesPayloadFromLocalStorage(projectId);
  }
  return {
    formatVersion: 1,
    savedAt: Date.now(),
    project: {
      id: projectId,
      name,
      kind: "standalone",
    },
    modules,
  };
}

async function updateIndexEntry(
  projectId: string,
  patch: Partial<Pick<ProjectIndexItem, "name" | "updatedAt" | "storageMode" | "fileRef">>
): Promise<void> {
  const driver = getStorageDriver();
  await driver.updateProjectMeta(projectId, patch);
}

export async function initializeFileBackedModularProject(
  modularProject: Project,
  fileRef: string
): Promise<void> {
  const subIds = Object.values(modularProject.subProjects ?? {});
  for (const id of subIds) {
    registerProjectFileRef(id, fileRef);
    await updateIndexEntry(id, { storageMode: "file", fileRef });
  }
  registerProjectFileRef(modularProject.id, fileRef);

  const synproj = await buildSynprojSnapshotForModularProject(modularProject);
  await getSynprojFileIO().write(fileRef, synproj);

  useAppStore.setState((state) => ({
    modularProjects: state.modularProjects.map((p) =>
      p.id === modularProject.id ? { ...p, storageMode: "file", fileRef } : p
    ),
  }));
  try {
    const raw = localStorage.getItem("synapse-iwe:app") ?? localStorage.getItem("plotmaster:app");
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.modularProjects = (parsed.modularProjects ?? parsed.projects ?? []).map((p: Project) =>
        p.id === modularProject.id ? { ...p, storageMode: "file", fileRef } : p
      );
      localStorage.setItem("synapse-iwe:app", JSON.stringify(parsed));
    }
  } catch { /* ignore */ }
}

export async function initializeFileBackedStandaloneProject(
  projectId: string,
  name: string,
  moduleType: string,
  fileRef: string
): Promise<void> {
  registerProjectFileRef(projectId, fileRef);
  await updateIndexEntry(projectId, { storageMode: "file", fileRef });

  const synproj = await buildSynprojSnapshotForStandalone(projectId, name, moduleType);
  await getSynprojFileIO().write(fileRef, synproj);

  useAppStore.setState((state) => ({
    standaloneProjects: state.standaloneProjects.map((p) =>
      p.id === projectId ? { ...p, storageMode: "file", fileRef } : p
    ),
  }));
  try {
    const raw = localStorage.getItem("synapse-iwe:app") ?? localStorage.getItem("plotmaster:app");
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.standaloneProjects = (parsed.standaloneProjects ?? []).map((p: StandaloneProject) =>
        p.id === projectId ? { ...p, storageMode: "file", fileRef } : p
      );
      localStorage.setItem("synapse-iwe:app", JSON.stringify(parsed));
    }
  } catch { /* ignore */ }
}

export async function convertProjectToFile(
  projectId: string,
  suggestedName: string
): Promise<string | null> {
  const io = getSynprojFileIO();
  const fileRef = await io.pickSaveLocation(suggestedName);
  if (!fileRef) return null;

  const appState = useAppStore.getState();
  const modular = appState.modularProjects.find(
    (p) => p.id === projectId || Object.values(p.subProjects ?? {}).includes(projectId)
  );
  if (modular) {
    await initializeFileBackedModularProject(modular, fileRef);
    return fileRef;
  }

  const standalone = appState.standaloneProjects.find((p) => p.id === projectId);
  if (standalone) {
    await initializeFileBackedStandaloneProject(projectId, standalone.name, standalone.moduleType, fileRef);
    return fileRef;
  }

  const driver = getStorageDriver();
  const index = await driver.listProjects();
  const entry = index.find((p) => p.id === projectId);
  if (entry) {
    registerProjectFileRef(projectId, fileRef);
    await updateIndexEntry(projectId, { storageMode: "file", fileRef });
    const synproj = await buildSynprojSnapshotForStandalone(projectId, entry.name, entry.moduleType);
    await io.write(fileRef, synproj);
    return fileRef;
  }

  return null;
}

export async function createInitialSynprojFile(
  fileRef: string,
  project: SynprojFile["project"],
  modules: Record<string, AnyModulePayload>
): Promise<void> {
  const file: SynprojFile = {
    formatVersion: 1,
    savedAt: Date.now(),
    project,
    modules,
  };
  await getSynprojFileIO().write(fileRef, file);
}

const TYPE_NAME_TO_DRIVER: Record<string, ProjectModuleType> = {
  "Family Tree": "familyTree",
  familyTree: "familyTree",
  Timeline: "timeline",
  timeline: "timeline",
  Profiles: "characterProfiles",
  characterProfiles: "characterProfiles",
  Ideas: "ideas",
  ideas: "ideas",
};

function persistAppStorePatch(
  patch: Partial<{ modularProjects: Project[]; standaloneProjects: StandaloneProject[] }>
): void {
  useAppStore.setState((state) => {
    const next = { ...state, ...patch };
    try {
      const raw = localStorage.getItem("synapse-iwe:app") ?? localStorage.getItem("plotmaster:app");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (patch.modularProjects) parsed.modularProjects = patch.modularProjects;
        if (patch.standaloneProjects) parsed.standaloneProjects = patch.standaloneProjects;
        localStorage.setItem("synapse-iwe:app", JSON.stringify(parsed));
      }
    } catch {
      /* ignore */
    }
    return next;
  });
}

function resolveRouteForFileRef(
  fileRef: string,
  driverIndex: ProjectIndexItem[]
): string | null {
  const appState = useAppStore.getState();

  const modular = appState.modularProjects.find((p) => p.fileRef === fileRef);
  if (modular) {
    const firstType = modular.enabledModules[0];
    const subId = firstType ? modular.subProjects?.[firstType] : undefined;
    if (subId) return getModuleRoute(firstType, subId);
  }

  const standalone = appState.standaloneProjects.find((p) => p.fileRef === fileRef);
  if (standalone) return getModuleRoute(standalone.moduleType, standalone.id);

  const driverEntry = driverIndex.find((p) => p.fileRef === fileRef);
  if (driverEntry) return getModuleRoute(driverEntry.moduleType, driverEntry.id);

  return null;
}

async function registerDriverBackedModule(
  subId: string,
  name: string,
  moduleType: ProjectModuleType,
  fileRef: string,
  driverIndex: ProjectIndexItem[]
): Promise<void> {
  registerProjectFileRef(subId, fileRef);
  if (driverIndex.some((p) => p.id === subId)) {
    await updateIndexEntry(subId, { storageMode: "file", fileRef, updatedAt: Date.now() });
    return;
  }
  const now = Date.now();
  await getStorageDriver().createProject({
    id: subId,
    name,
    moduleType,
    createdAt: now,
    updatedAt: now,
    storageMode: "file",
    fileRef,
  });
}

function registerStandaloneModule(
  subId: string,
  name: string,
  moduleType: string,
  fileRef: string
): void {
  registerProjectFileRef(subId, fileRef);
  const appState = useAppStore.getState();
  if (appState.standaloneProjects.some((p) => p.id === subId)) {
    persistAppStorePatch({
      standaloneProjects: appState.standaloneProjects.map((p) =>
        p.id === subId ? { ...p, storageMode: "file", fileRef, lastOpened: Date.now() } : p
      ),
    });
    return;
  }
  const project: StandaloneProject = {
    id: subId,
    name,
    moduleType,
    lastOpened: Date.now(),
    storageMode: "file",
    fileRef,
  };
  persistAppStorePatch({
    standaloneProjects: [project, ...appState.standaloneProjects],
  });
}

async function hydrateSynprojFromFile(
  fileRef: string,
  contents: SynprojFile
): Promise<string> {
  const { project } = contents;
  const driver = getStorageDriver();
  const driverIndex = await driver.listProjects();
  const now = Date.now();

  registerProjectFileRef(project.id, fileRef);

  if (project.kind === "modular") {
    const subProjects = project.subProjects ?? {};
    const enabledModules = project.enabledModules ?? Object.keys(subProjects);

    for (const [typeName, subId] of Object.entries(subProjects)) {
      const payload = contents.modules[subId];
      const driverType =
        payload?.moduleType === "familyTree"
          ? "familyTree"
          : payload?.moduleType === "timeline"
            ? "timeline"
            : TYPE_NAME_TO_DRIVER[typeName];

      if (driverType === "familyTree" || driverType === "timeline") {
        await registerDriverBackedModule(subId, project.name, driverType, fileRef, driverIndex);
      } else if (
        payload &&
        (isCharacterProfilesPayload(payload) || driverType === "characterProfiles")
      ) {
        registerStandaloneModule(subId, project.name, "Profiles", fileRef);
      } else if (driverType === "ideas") {
        registerStandaloneModule(subId, project.name, "Ideas", fileRef);
      }
    }

    const modularProject: Project = {
      id: project.id,
      name: project.name,
      enabledModules,
      subProjects,
      lastOpened: now,
      storageMode: "file",
      fileRef,
    };
    const appState = useAppStore.getState();
    const exists = appState.modularProjects.some((p) => p.id === project.id);
    persistAppStorePatch({
      modularProjects: exists
        ? appState.modularProjects.map((p) =>
            p.id === project.id ? { ...p, ...modularProject } : p
          )
        : [modularProject, ...appState.modularProjects],
    });

    const firstType = enabledModules[0];
    const firstSubId = firstType ? subProjects[firstType] : undefined;
    if (!firstSubId) throw new Error("Modular project has no modules");
    return getModuleRoute(firstType, firstSubId);
  }

  const moduleId = project.id;
  const payload = contents.modules[moduleId];
  if (payload?.moduleType === "familyTree") {
    await registerDriverBackedModule(moduleId, project.name, "familyTree", fileRef, driverIndex);
    return getModuleRoute("familyTree", moduleId);
  }
  if (payload?.moduleType === "timeline") {
    await registerDriverBackedModule(moduleId, project.name, "timeline", fileRef, driverIndex);
    return getModuleRoute("timeline", moduleId);
  }
  if (payload && isCharacterProfilesPayload(payload)) {
    registerStandaloneModule(moduleId, project.name, "Profiles", fileRef);
    return getModuleRoute("Profiles", moduleId);
  }
  registerStandaloneModule(moduleId, project.name, "Ideas", fileRef);
  return getModuleRoute("Ideas", moduleId);
}

/** Open a .synproj file from disk, register it in recents if new, return navigation path. */
export async function openSynprojFileAndRegister(): Promise<{ path: string } | null> {
  const io = getSynprojFileIO();
  const picked = await io.pickOpenLocation();
  if (!picked) return null;

  const { fileRef, contents } = picked;
  const driverIndex = await getStorageDriver().listProjects();

  const existingRoute = resolveRouteForFileRef(fileRef, driverIndex);
  if (existingRoute) {
    return { path: existingRoute };
  }

  const path = await hydrateSynprojFromFile(fileRef, contents);
  return { path };
}

export function downloadSynprojFallback(data: SynprojFile, filename: string): void {
  const blob = new Blob([serializeSynprojFile(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".synproj") ? filename : `${filename}.synproj`;
  a.click();
  URL.revokeObjectURL(url);
}
