import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "reactflow";
import { useFamilyTreeStore, type ConnectionIconRef } from "../../store/familyTreeStore";
import { renderConnectionIcon } from "./connectionIconRegistry";

export default function ConnectionIconEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
  markerEnd,
}: EdgeProps) {
  const legendMode = useFamilyTreeStore((s) => s.legendMode);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const icon = (data as { icon?: ConnectionIconRef } | undefined)?.icon;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {legendMode === "tooltipsAndIcons" && icon && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan flex items-center justify-center w-5 h-5 rounded-full bg-dark-surface/90 border border-dark-accent shadow-sm"
          >
            {renderConnectionIcon(icon, 12)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
