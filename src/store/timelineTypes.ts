import type { TimelineOrientation } from "../storage/StorageDriver";

export const LANE_TYPE_PRESETS = ["character", "act", "theme", "subplot"] as const;

export const TIMELINE_GRID_SIZE = 8;
export const LANE_WIDTH = 160;
export const LANE_GAP = 40;
export const BEAT_DY = 72;
export const LANE_HEADER_HEIGHT = 36;
export const TIMELINE_CANVAS_BOTTOM_Y = 480;
export const TIMELINE_CANVAS_ORIGIN_X = 60;
export const TIMELINE_LANE_HEADER_Y = 24;

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

export interface LaneNodeData {
  kind: "lane";
  laneId: string;
  label: string;
  laneType: string;
}

export interface BeatNodeData {
  kind: "beat";
  beatId: string;
  title: string;
}

export type TimelineNodeData = LaneNodeData | BeatNodeData;

export function laneHeaderNodeId(laneId: string): string {
  return `lane-header-${laneId}`;
}

export function isLaneHeaderNodeId(nodeId: string): boolean {
  return nodeId.startsWith("lane-header-");
}

export function laneIdFromHeaderNodeId(nodeId: string): string | null {
  if (!isLaneHeaderNodeId(nodeId)) return null;
  return nodeId.slice("lane-header-".length);
}

export function laneColumnX(sortOrder: number): number {
  return TIMELINE_CANVAS_ORIGIN_X + sortOrder * (LANE_WIDTH + LANE_GAP);
}

export function beatYForOrder(order: number, _orientation: TimelineOrientation): number {
  return TIMELINE_CANVAS_BOTTOM_Y - order * BEAT_DY;
}
