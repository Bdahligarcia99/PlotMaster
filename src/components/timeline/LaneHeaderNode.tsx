import { memo } from "react";
import type { NodeProps } from "reactflow";
import type { LaneNodeData } from "../../store/timelineTypes";
import { LANE_WIDTH } from "../../store/timelineGraph";

function LaneHeaderNode({ data, selected }: NodeProps<LaneNodeData>) {
  return (
    <div
      className={`px-3 py-1.5 rounded-lg border text-xs font-medium uppercase tracking-wide text-center truncate
        ${selected ? "border-blue-500 bg-blue-500/10 text-dark-text ring-2 ring-blue-500/40" : "border-dark-accent/70 bg-dark-accent/30 text-dark-muted"}`}
      style={{ width: LANE_WIDTH }}
      title={`${data.label} (${data.laneType})`}
    >
      {data.label}
    </div>
  );
}

export default memo(LaneHeaderNode);
