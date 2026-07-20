import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { BeatNodeData } from "../../store/timelineTypes";
import { LANE_WIDTH } from "../../store/timelineGraph";

function BeatNode({ data, selected }: NodeProps<BeatNodeData>) {
  return (
    <div
      className={`group px-3 py-2 rounded-lg border bg-dark-surface text-sm text-dark-text shadow-sm min-h-[2.5rem] flex items-center justify-center text-center
        ${selected ? "border-blue-500 ring-2 ring-blue-500/40" : "border-dark-accent hover:border-dark-muted"}`}
      style={{ width: LANE_WIDTH }}
    >
      <Handle type="target" position={Position.Bottom} className="!bg-dark-muted !w-2 !h-2 !border-0" />
      <span className="truncate w-full">{data.title || "Beat"}</span>
      <Handle type="source" position={Position.Top} className="!bg-dark-muted !w-2 !h-2 !border-0" />
    </div>
  );
}

export default memo(BeatNode);
