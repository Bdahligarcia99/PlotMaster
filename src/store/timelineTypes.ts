export const LANE_TYPE_PRESETS = ["character", "act", "theme", "subplot"] as const;

/** Discrete zoom steps: how many lane columns are targeted to fit the viewport at once. */
export const ZOOM_LANE_COUNT_STEPS = [3, 4, 5, 6, 8, 10, 12] as const;
export const DEFAULT_ZOOM_LANE_COUNT = 5;

/** Floor so a lane column never becomes unusably narrow on tiny viewports. */
export const LANE_MIN_WIDTH_PX = 140;

/** Fixed height of the sticky "starting gate" row pinned to the base of the board. */
export const LANE_GATE_HEIGHT_PX = 56;

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

export interface TimelineBeat {
  id: string;
  laneId: string;
  order: number;
  title: string;
  description: string;
  date: string;
}

/** Crossing connector: an additive visual link between two beats. Never a graph node/hub. */
export interface TimelineConnection {
  id: string;
  beatIdA: string;
  beatIdB: string;
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
