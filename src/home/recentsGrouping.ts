import type { ProjectIndexItem } from "../storage/StorageDriver";
import type { Project, StandaloneProject } from "../store/appStore";
import { getRegistryItemForTypeName, sortTypeNamesByCanonicalOrder } from "./moduleRegistry";

/** One module indicator shown on a grouped (multi-module) Recents card. */
export interface RecentModuleIndicator {
  registryId: string;
  /** WorkspaceShell/moduleType display name (e.g. "Family Tree"), needed for routing. */
  typeName: string;
  label: string;
  icon: string;
  /** The module's own sub-project id, used to open it directly. */
  subProjectId: string;
}

/** A Recents card representing a multi-module ("modular") project. */
export interface RecentModularEntry {
  kind: "modular";
  id: string;
  name: string;
  lastOpened: number;
  storageMode?: "localStorage" | "file";
  fileRef?: string;
  /** All enabled modules, in canonical registry order. */
  modules: RecentModuleIndicator[];
}

/** A Recents card representing a single-module project (driver-backed or standalone). */
export interface RecentSingleEntry {
  kind: "driver" | "standalone";
  id: string;
  name: string;
  lastOpened: number;
  moduleType: string;
  storageMode?: "localStorage" | "file";
  fileRef?: string;
}

export type RecentEntry = RecentModularEntry | RecentSingleEntry;

/** Number of modules represented by a Recents entry (used by the Single/Multi filter). */
export function getModuleCount(entry: RecentEntry): number {
  return entry.kind === "modular" ? entry.modules.length : 1;
}

/**
 * Merges modular (multi-module), driver-backed, and standalone projects into
 * one Recents list. Sub-projects already represented inside a modular entry
 * are excluded from appearing again as their own separate card.
 */
export function buildRecentsList(
  modularProjects: Project[],
  driverProjects: ProjectIndexItem[],
  standaloneProjects: StandaloneProject[]
): RecentEntry[] {
  const coveredSubIds = new Set<string>();

  const modularEntries: RecentModularEntry[] = modularProjects.map((mp) => {
    const subProjects = mp.subProjects ?? {};
    const orderedTypeNames = sortTypeNamesByCanonicalOrder(Object.keys(subProjects));
    const modules: RecentModuleIndicator[] = [];
    for (const typeName of orderedTypeNames) {
      const subProjectId = subProjects[typeName];
      if (!subProjectId) continue;
      coveredSubIds.add(subProjectId);
      const registryItem = getRegistryItemForTypeName(typeName);
      modules.push({
        registryId: registryItem?.id ?? typeName,
        typeName,
        label: registryItem?.label ?? typeName,
        icon: registryItem?.icon ?? "•",
        subProjectId,
      });
    }
    return {
      kind: "modular",
      id: mp.id,
      name: mp.name,
      lastOpened: mp.lastOpened,
      storageMode: mp.storageMode,
      fileRef: mp.fileRef,
      modules,
    };
  });

  const driverEntries: RecentSingleEntry[] = driverProjects
    .filter((p) => !coveredSubIds.has(p.id))
    .map((p) => ({
      kind: "driver",
      id: p.id,
      name: p.name,
      lastOpened: p.updatedAt,
      moduleType: p.moduleType,
      storageMode: p.storageMode,
      fileRef: p.fileRef,
    }));

  const standaloneEntries: RecentSingleEntry[] = standaloneProjects
    .filter((p) => !coveredSubIds.has(p.id))
    .map((p) => ({
      kind: "standalone",
      id: p.id,
      name: p.name,
      lastOpened: p.lastOpened,
      moduleType: p.moduleType,
      storageMode: p.storageMode,
      fileRef: p.fileRef,
    }));

  return [...modularEntries, ...driverEntries, ...standaloneEntries].sort(
    (a, b) => b.lastOpened - a.lastOpened
  );
}
