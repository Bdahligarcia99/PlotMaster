export const MODULE_TYPES = [
  "Timeline",
  "Family Tree",
  "Profiles",
  "Ideas",
] as const;

export type ModuleType = (typeof MODULE_TYPES)[number];
