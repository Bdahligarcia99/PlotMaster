/** Single source of truth for which modules are enabled. */
export const AVAILABLE_MODULES = ["familyTree", "charts", "timeline", "ideaPlayground"] as const;

/** Modules selectable when creating a multi-module project (functional only). */
export const CREATEABLE_MODULES = ["familyTree", "charts", "timeline"] as const;

export type AvailableModuleId = (typeof AVAILABLE_MODULES)[number];
export type CreateableModuleId = (typeof CREATEABLE_MODULES)[number];

/** Maps module id to WorkspaceShell/moduleType display name. */
export const MODULE_ID_TO_TYPE: Record<string, string> = {
  familyTree: "Family Tree",
  charts: "Charts",
  timeline: "Timeline",
  ideaPlayground: "Ideas",
};

/**
 * Maps a module's WorkspaceShell/moduleType display name (e.g. "Family Tree",
 * "Charts") back to its registry id. Reverse of MODULE_ID_TO_TYPE, shared so
 * every consumer (module switcher, Recents grouping, etc.) uses one source of
 * truth for icon/label lookup and canonical ordering.
 */
export const MODULE_TYPE_NAME_TO_REGISTRY_ID: Record<string, string> = {
  "Family Tree": "familyTree",
  Charts: "charts",
  /** @deprecated legacy modular/subProjects key — read-side migration only */
  Profiles: "charts",
  Timeline: "timeline",
  Ideas: "ideaPlayground",
};

export interface ModuleRegistryItem {
  id: string;
  label: string;
  icon: string;
  available: boolean;
  /** "primary" = Core tier (Neuron, Axon); "sub" = Engram tier. */
  tier: "primary" | "sub";
  description?: string;
}

/** Canonical module order used anywhere multiple module indicators are shown together. */
export const MODULE_REGISTRY: ModuleRegistryItem[] = [
  {
    id: "neuron",
    label: "Neuron",
    icon: "🗂️",
    available: false,
    tier: "primary",
    description: "Scrivener-style binder for hierarchical text files.",
  },
  {
    id: "axon",
    label: "Axon",
    icon: "🕸️",
    available: false,
    tier: "primary",
    description: "Cross-module link viewer and relationship manager.",
  },
  {
    id: "familyTree",
    label: "Family Tree",
    icon: "👪",
    available: true,
    tier: "sub",
    description: "Create node-based family tree layouts.",
  },
  {
    id: "charts",
    label: "Charts",
    icon: "👤",
    available: true,
    tier: "sub",
    description: "Design, edit, and create charts for your writing projects.",
  },
  {
    id: "timeline",
    label: "Timeline Outliner",
    icon: "🗓️",
    available: true,
    tier: "sub",
    description: "Plan your stories with advanced plot grids.",
  },
  {
    id: "ideaPlayground",
    label: "Ideas Playground",
    icon: "🧠",
    available: true,
    tier: "sub",
    description: "Dump, digest, develop ideas into story components.",
  },
  {
    id: "imagePlayground",
    label: "Image Playground",
    icon: "🖼️",
    available: false,
    tier: "sub",
  },
];

/** Driver index moduleType values that aren't display names. */
const DRIVER_TYPE_TO_REGISTRY_ID: Record<string, string> = {
  familyTree: "familyTree",
  timeline: "timeline",
  charts: "charts",
  /** @deprecated legacy driver type — read-side migration only */
  characterProfiles: "charts",
  ideas: "ideaPlayground",
};

/** Looks up a registry item from a module's display type name (e.g. "Family Tree"). */
export function getRegistryItemForTypeName(typeName: string): ModuleRegistryItem | undefined {
  const registryId = MODULE_TYPE_NAME_TO_REGISTRY_ID[typeName];
  return MODULE_REGISTRY.find((m) => m.id === registryId);
}

/** Resolves a driver moduleType or standalone moduleType string to a registry item. */
export function getRegistryItemForModuleKey(moduleKey: string): ModuleRegistryItem | undefined {
  const registryId =
    MODULE_TYPE_NAME_TO_REGISTRY_ID[moduleKey] ??
    DRIVER_TYPE_TO_REGISTRY_ID[moduleKey] ??
    moduleKey;
  return MODULE_REGISTRY.find((m) => m.id === registryId);
}

/** Sorts module display type names (e.g. "Family Tree", "Charts") into canonical registry order. */
export function sortTypeNamesByCanonicalOrder(typeNames: string[]): string[] {
  return [...typeNames].sort((a, b) => {
    const aIdx = MODULE_REGISTRY.findIndex((m) => m.id === MODULE_TYPE_NAME_TO_REGISTRY_ID[a]);
    const bIdx = MODULE_REGISTRY.findIndex((m) => m.id === MODULE_TYPE_NAME_TO_REGISTRY_ID[b]);
    return (aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx) - (bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx);
  });
}
