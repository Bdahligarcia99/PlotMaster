import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { PersonNodeData } from "../../store/familyTreeStore";

function PersonNode({ data, selected }: NodeProps<PersonNodeData>) {
  const nodeData = data;
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 min-w-[120px] transition-colors ${
        selected
          ? "bg-dark-surface border-blue-500 shadow-lg shadow-blue-500/20"
          : "bg-dark-surface border-dark-accent hover:border-dark-muted"
      }`}
    >
      <Handle type="source" position={Position.Bottom} id="partner" className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />
      <Handle type="target" position={Position.Top} id="parent" className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />
      <div className="text-dark-text font-medium text-sm text-center">
        {nodeData.name || "New Person"}
      </div>
    </div>
  );
}

export default memo(PersonNode);
