export const LANE_TYPE_PRESETS = ["character", "act", "theme", "subplot"] as const;

/** Discrete zoom steps: how many lane columns are targeted to fit the viewport at once. */
export const ZOOM_LANE_COUNT_STEPS = [3, 4, 5, 6, 8, 10, 12] as const;
export const DEFAULT_ZOOM_LANE_COUNT = 5;

/** Floor so a lane column never becomes unusably narrow on tiny viewports. */
export const LANE_MIN_WIDTH_PX = 140;

/** Fixed height of the sticky "starting gate" row pinned to the base of the board. */
export const LANE_GATE_HEIGHT_PX = 56;

export const DEFAULT_BEAT_WIDTH_PERCENT = 100;
export const BEAT_WIDTH_PERCENT_MIN = 20;
export const BEAT_WIDTH_PERCENT_MAX = 100;

export const BEAT_COLLAPSED_HEIGHT_PX = 44;
export const DEFAULT_EXPANDED_BEAT_HEIGHT_PX = 160;
export const EXPANDED_BEAT_HEIGHT_MIN = 80;
export const EXPANDED_BEAT_HEIGHT_MAX = 400;
export const BEAT_HEIGHT_TRANSITION_MS = 200;

export function getZoomLaneCountSteps(): readonly number[] {
  return ZOOM_LANE_COUNT_STEPS;
}

/** Snap a target lane count to the nearest discrete zoom step. */
export function snapZoomLaneCount(count: number): number {
  let best: number = ZOOM_LANE_COUNT_STEPS[0];
  for (const step of ZOOM_LANE_COUNT_STEPS) {
    if (Math.abs(step - count) < Math.abs(best - count)) best = step;
  }
  return best;
}

export interface TimelineLane {
  id: string;
  label: string;
  laneType: string;
  sortOrder: number;
}

export const ANCHOR_GHOST_COUNT_MIN = 0;
export const ANCHOR_GHOST_COUNT_MAX = 8;
export const DEFAULT_ANCHOR_GHOSTS_ABOVE = 1;
export const DEFAULT_ANCHOR_GHOSTS_BELOW = 1;

export interface TimelineBeat {
  id: string;
  laneId: string;
  order: number;
  kind: "story" | "empty" | "anchor";
  title: string;
  description: string;
  date: string;
  /** Set on anchor-spawned ghost beats only — references the owning anchor beat id. */
  anchorId?: string;
  /** Set on anchor-spawned ghost beats only — which side of the anchor this ghost reserves. */
  ghostSide?: "above" | "below";
}

/** Crossing connector: an additive visual link between N beats (N ≥ 2), at most one beat per lane. Never a graph node/hub. */
export interface TimelineConnection {
  id: string;
  beatIds: string[];
  title: string;
  description: string;
  date: string;
}

/** A single selectable thing on the board — a lane, a beat, or a crossing connector. */
export interface TimelineSelectionItem {
  type: "lane" | "beat" | "connection";
  id: string;
}

export function getDefaultLaneLabel(sortOrder: number): string {
  return `Lane ${sortOrder + 1}`;
}

export function getDefaultBeatTitle(existingLaneBeats: TimelineBeat[]): string {
  return `Beat ${existingLaneBeats.length + 1}`;
}

export function getDefaultAnchorTitle(existingLaneBeats: TimelineBeat[]): string {
  const n = existingLaneBeats.filter((b) => b.kind === "anchor").length;
  return n === 0 ? "Anchor" : `Anchor ${n + 1}`;
}
