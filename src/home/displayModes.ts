export type DisplayMode = "block" | "nodes" | "charts" | "text";

export const DISPLAY_MODE_ORDER: DisplayMode[] = ["block", "nodes", "charts", "text"];

export const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
  block: "Block",
  nodes: "Nodes",
  charts: "Charts",
  text: "Script",
};

/** Which modes each Engram (registry id) currently supports. Empty = none yet (still shows a disabled dropdown). */
export const ENGRAM_DISPLAY_MODES: Record<string, DisplayMode[]> = {
  timeline: ["block", "text"],
  familyTree: ["nodes"],
  charts: ["charts"],
  ideaPlayground: [],
  imagePlayground: [],
};

export function getSupportedDisplayModes(registryId: string): DisplayMode[] {
  return ENGRAM_DISPLAY_MODES[registryId] ?? [];
}
