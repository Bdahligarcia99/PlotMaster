/** Single source of truth for which modules are enabled. */
export const AVAILABLE_MODULES = ["familyTree", "characters", "timeline", "ideaPlayground"] as const;

/** Modules selectable when creating a multi-module project (functional only). */
export const CREATEABLE_MODULES = ["familyTree", "characters", "timeline"] as const;

export type AvailableModuleId = (typeof AVAILABLE_MODULES)[number];
export type CreateableModuleId = (typeof CREATEABLE_MODULES)[number];

/** Maps module id to WorkspaceShell/moduleType display name. */
export const MODULE_ID_TO_TYPE: Record<string, string> = {
  familyTree: "Family Tree",
  characters: "Profiles",
  timeline: "Timeline",
  ideaPlayground: "Ideas",
};

export interface ModuleRegistryItem {
  id: string;
  label: string;
  icon: string;
  available: boolean;
  description?: string;
}

export const MODULE_REGISTRY: ModuleRegistryItem[] = [
  {
    id: "characters",
    label: "Characters",
    icon: "👤",
    available: true,
    description: "Design, edit, create character profile sheets.",
  },
  {
    id: "familyTree",
    label: "Family Tree",
    icon: "👪",
    available: true,
    description: "Create node-based family tree layouts.",
  },
  {
    id: "timeline",
    label: "Timeline Outliner",
    icon: "🗓️",
    available: true,
    description: "Plan your stories with advanced plot grids.",
  },
  {
    id: "ideaPlayground",
    label: "Ideas Playground",
    icon: "🧠",
    available: true,
    description: "Dump, digest, develop ideas into story components.",
  },
  { id: "imagePlayground", label: "Image Playground", icon: "🖼️", available: false },
];
