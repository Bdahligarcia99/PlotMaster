import { useStore, useReactFlow } from "reactflow";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import { DEFAULT_PERSON_W, DEFAULT_PERSON_H, DEFAULT_UNION_W, DEFAULT_UNION_H } from "../../store/familyTreeStore";

/** Renders ΔX/ΔY spacing overlay when exactly 2 nodes selected. */
export default function NodeSpacingOverlay() {
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const selectedNodeIds = useFamilyTreeStore((s) => s.selectedNodeIds);
  const nodeSizesById = useFamilyTreeStore((s) => s.nodeSizesById);
  const showNodeInfoEnabled = useFamilyTreeStore((s) => s.showNodeInfoEnabled);
  const nodeInfoSpacing = useFamilyTreeStore((s) => s.nodeInfoSpacing);
  const { flowToScreenPosition } = useReactFlow();
  const domNode = useStore((s) => s.domNode);

  if (!showNodeInfoEnabled || !nodeInfoSpacing || selectedNodeIds.length !== 2 || !domNode) return null;

  const [idA, idB] = selectedNodeIds;
  const nodeA = nodes.find((n) => n.id === idA);
  const nodeB = nodes.find((n) => n.id === idB);
  if (!nodeA || !nodeB) return null;

  const getSize = (id: string, isUnion: boolean) => {
    const sz = nodeSizesById[id];
    if (sz) return { w: sz.width, h: sz.height };
    return isUnion ? { w: DEFAULT_UNION_W, h: DEFAULT_UNION_H } : { w: DEFAULT_PERSON_W, h: DEFAULT_PERSON_H };
  };

  const isUnionA = nodeA.type === "union";
  const isUnionB = nodeB.type === "union";
  const sizeA = getSize(nodeA.id, isUnionA);
  const sizeB = getSize(nodeB.id, isUnionB);

  const leftA = nodeA.position.x;
  const rightA = nodeA.position.x + sizeA.w;
  const topA = nodeA.position.y;
  const bottomA = nodeA.position.y + sizeA.h;

  const leftB = nodeB.position.x;
  const rightB = nodeB.position.x + sizeB.w;
  const topB = nodeB.position.y;
  const bottomB = nodeB.position.y + sizeB.h;

  const gapX =
    leftA <= leftB ? Math.round(leftB - rightA) : Math.round(leftA - rightB);
  const gapY =
    topA <= topB ? Math.round(topB - bottomA) : Math.round(topA - bottomB);

  const midFlowX = (nodeA.position.x + sizeA.w / 2 + nodeB.position.x + sizeB.w / 2) / 2;
  const midFlowY = (nodeA.position.y + sizeA.h / 2 + nodeB.position.y + sizeB.h / 2) / 2;

  const screenPos = flowToScreenPosition({ x: midFlowX, y: midFlowY });
  const rect = domNode.getBoundingClientRect();
  const left = screenPos.x - rect.left;
  const top = screenPos.y - rect.top;

  return (
    <div
      className="absolute pointer-events-none z-20 px-2 py-1 text-xs font-mono text-dark-muted bg-dark-surface/95 border border-dark-accent rounded-lg shadow -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
      style={{ left, top }}
      aria-hidden
    >
      ΔX: {gapX} &nbsp; ΔY: {gapY}
    </div>
  );
}
