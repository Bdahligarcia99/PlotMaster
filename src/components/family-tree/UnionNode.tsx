import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { UnionNodeData } from "../../store/familyTreeStore";
import { useFamilyTreeStore } from "../../store/familyTreeStore";

function UnionNode({ selected, xPos, yPos }: NodeProps<UnionNodeData>) {
  const showCoordinates = useFamilyTreeStore((s) => s.showCoordinates);
  const x = Math.round(xPos);
  const y = Math.round(yPos);

  const coordsOverlayClass =
    "absolute -top-1 right-0 translate-x-full px-1.5 py-0.5 text-xs font-mono text-dark-muted bg-dark-bg border border-dark-accent rounded shadow pointer-events-none z-40 whitespace-nowrap";

  return (
    <div className="relative group">
      {/* Coordinates overlay: always visible when toggle ON, independent of hover */}
      {showCoordinates && (
        <div className={coordsOverlayClass}>
          x: {x}  y: {y}
        </div>
      )}

      <div
        className={`px-3 py-2 rounded-lg border min-w-[60px] flex flex-col items-center justify-center transition-colors ${
          selected
            ? "bg-dark-accent/80 border-blue-500 shadow-md"
            : "bg-dark-accent/50 border-dark-accent hover:border-dark-muted"
        }`}
      >
        <Handle type="target" position={Position.Top} id="partners" className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />
        <Handle type="source" position={Position.Bottom} id="children" className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />
        <span className="text-dark-muted text-xs font-medium">{"<=>"}</span>
      </div>
    </div>
  );
}

export default memo(UnionNode);
