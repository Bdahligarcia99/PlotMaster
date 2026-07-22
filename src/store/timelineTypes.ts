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

export const DEFAULT_BEAT_TEXT_SCALE_PERCENT = 100;
export const BEAT_TEXT_SCALE_PERCENT_MIN = 50;
export const BEAT_TEXT_SCALE_PERCENT_MAX = 200;

export const BEAT_COLLAPSED_HEIGHT_PX = 44;
export const DEFAULT_EXPANDED_BEAT_HEIGHT_PX = 200;
export const EXPANDED_BEAT_HEIGHT_MIN = 120;
export const EXPANDED_BEAT_HEIGHT_MAX = 400;
export const BEAT_HEIGHT_TRANSITION_MS = 200;

/** Vertical gap between stacked beats (matches the `gap-2` Tailwind class in LaneColumn). Used to
 * convert between beat "slots" and pixels for the invisible slot grid. */
export const BEAT_GAP_PX = 8;
/** Padding at the top/bottom of a lane's track (matches the `py-2` Tailwind class in LaneColumn). */
export const LANE_TRACK_PADDING_PX = 8;
/** Extra empty slots always reserved above the highest occupied slot on the board, so there's
 * always a bit of headroom to drag a beat higher than anything that currently exists. */
export const SLOT_HEADROOM = 6;

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

export type BeatDateMode = "none" | "label" | "absolute" | "relative" | "resolved";

export interface BeatDateRelative {
  years: number;
  months: number;
  days: number;
  originBeatId: string;
}

export interface BeatDateSpec {
  mode: BeatDateMode;
  label?: string;
  absolute?: string;
  relative?: BeatDateRelative;
  resolved?: string;
}

export interface TimelineBeat {
  id: string;
  laneId: string;
  /** Absolute row on the board's invisible slot grid — shared across every lane, so two beats on
   * the same slot (in different lanes) always line up at the same height. Slot 0 sits at the
   * bottom, nearest the starting gate. Gaps between slots are just unused rows; they don't need a
   * beat object to "reserve" the space. */
  slot: number;
  kind: "story" | "anchor";
  title: string;
  synopsis: string;
  detail: string;
  dateSpec: BeatDateSpec;
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
