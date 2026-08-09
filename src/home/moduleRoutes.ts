/** Maps module type display name to client route path prefix. */
const MODULE_TYPE_TO_ROUTE: Record<string, string> = {
  "Family Tree": "/family-tree",
  familyTree: "/family-tree",
  Timeline: "/timeline",
  timeline: "/timeline",
  Charts: "/project",
  charts: "/project",
  /** @deprecated legacy type names — read-side migration only */
  Profiles: "/project",
  characterProfiles: "/project",
  Ideas: "/project",
  ideas: "/project",
};

/** Returns the app route for opening a module sub-project by id. */
export function getModuleRoute(moduleType: string, projectId: string): string {
  const prefix = MODULE_TYPE_TO_ROUTE[moduleType] ?? "/project";
  return `${prefix}/${projectId}`;
}

/** Reverse lookup: module type name from registry id. */
export function moduleIdToTypeName(moduleId: string): string {
  const map: Record<string, string> = {
    familyTree: "Family Tree",
    charts: "Charts",
    timeline: "Timeline",
    ideaPlayground: "Ideas",
  };
  return map[moduleId] ?? moduleId;
}
