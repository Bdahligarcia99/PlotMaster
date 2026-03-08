/** Single source of truth for which modules are enabled. */
export const AVAILABLE_MODULES = ["familyTree", "characters", "timeline", "ideaPlayground"] as const;

export type AvailableModuleId = (typeof AVAILABLE_MODULES)[number];

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
}

export const MODULE_REGISTRY: ModuleRegistryItem[] = [
  { id: "characters", label: "Characters", icon: "👤", available: true },
  { id: "familyTree", label: "Family Tree", icon: "👪", available: true },
  { id: "timeline", label: "Timeline Outliner", icon: "🗓️", available: true },
  { id: "ideaPlayground", label: "Ideas Playground", icon: "🧠", available: true },
  { id: "imagePlayground", label: "Image Playground", icon: "🖼️", available: false },
];
