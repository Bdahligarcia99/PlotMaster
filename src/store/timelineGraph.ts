import type { Edge, Node } from "reactflow";
import type { TimelineOrientation } from "../storage/StorageDriver";
import {
  beatYForOrder,
  laneColumnX,
  laneHeaderNodeId,
  LANE_HEADER_HEIGHT,
  LANE_WIDTH,
  TIMELINE_LANE_HEADER_Y,
  type TimelineBeat,
  type TimelineLane,
  type TimelineNodeData,
} from "./timelineTypes";

export function buildTimelineGraph(
  lanes: TimelineLane[],
  beats: TimelineBeat[],
  orientation: TimelineOrientation
): { nodes: Node<TimelineNodeData>[]; edges: Edge[] } {
  const sortedLanes = [...lanes].sort((a, b) => a.sortOrder - b.sortOrder);
  const nodes: Node<TimelineNodeData>[] = [];
  const edges: Edge[] = [];

  for (const lane of sortedLanes) {
    const x = laneColumnX(lane.sortOrder);
    nodes.push({
      id: laneHeaderNodeId(lane.id),
      type: "lane",
      position: { x, y: TIMELINE_LANE_HEADER_Y },
      data: {
        kind: "lane",
        laneId: lane.id,
        label: lane.label,
        laneType: lane.laneType,
      },
      draggable: false,
      selectable: true,
    });

    const laneBeats = beats
      .filter((b) => b.laneId === lane.id)
      .sort((a, b) => a.order - b.order);

    for (const beat of laneBeats) {
      nodes.push({
        id: beat.id,
        type: "beat",
        position: {
          x,
          y: beatYForOrder(beat.order, orientation),
        },
        data: {
          kind: "beat",
          beatId: beat.id,
          title: beat.title,
        },
        draggable: false,
        selectable: true,
      });
    }

    for (let i = 0; i < laneBeats.length - 1; i++) {
      const earlier = laneBeats[i];
      const later = laneBeats[i + 1];
      edges.push({
        id: `beat-edge-${earlier.id}-${later.id}`,
        source: earlier.id,
        target: later.id,
        type: "smoothstep",
        data: { type: "sequence" },
        style: { stroke: "#64748b" },
      });
    }
  }

  return { nodes, edges };
}

export function getDefaultBeatTitle(laneBeats: TimelineBeat[]): string {
  return `Beat ${laneBeats.length + 1}`;
}

export function getDefaultLaneLabel(sortOrder: number): string {
  return `Lane ${sortOrder + 1}`;
}

export { LANE_WIDTH, LANE_HEADER_HEIGHT };
