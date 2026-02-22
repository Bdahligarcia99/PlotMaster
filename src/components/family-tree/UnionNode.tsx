import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { UnionNodeData } from "../../store/familyTreeStore";

function UnionNode({ selected }: NodeProps<UnionNodeData>) {
  return (
    <div
      className={`px-3 py-2 rounded-lg border min-w-[60px] flex items-center justify-center transition-colors ${
        selected
          ? "bg-dark-accent/80 border-blue-500 shadow-md"
          : "bg-dark-accent/50 border-dark-accent hover:border-dark-muted"
      }`}
    >
      <Handle type="target" position={Position.Top} id="partners" className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />
      <Handle type="source" position={Position.Bottom} id="children" className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />
      <span className="text-dark-muted text-xs font-medium">{"<=>"}</span>
    </div>
  );
}

export default memo(UnionNode);
