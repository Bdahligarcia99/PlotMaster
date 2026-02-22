import { useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  type OnNodesChange,
  type OnEdgesChange,
  type OnSelectionChangeFunc,
  type NodeMouseHandler,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import { FAMILY_TREE_GRID_SIZE } from "../../store/familyTreeStore";
import PersonNode from "./PersonNode";
import UnionNode from "./UnionNode";

const nodeTypes = { person: PersonNode, union: UnionNode };

export default function FamilyTreeCanvas() {
  const { nodes, edges, setNodes, setEdges, setSelectedNodeIds, selectedNodeIds, snapToGrid } =
    useFamilyTreeStore();

  const nodesWithSelection = nodes.map((n) => ({
    ...n,
    selected: selectedNodeIds.includes(n.id),
  }));

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );
  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      setSelectedNodeIds(selectedNodes.map((n) => n.id));
    },
    [setSelectedNodeIds]
  );
  const onNodeClick: NodeMouseHandler = useCallback(
    (evt, node) => {
      if (evt.shiftKey) {
        setSelectedNodeIds((prev) => {
          const next = prev.includes(node.id)
            ? prev.filter((id) => id !== node.id)
            : [...prev, node.id];
          return next;
        });
      } else {
        setSelectedNodeIds([node.id]);
      }
    },
    [setSelectedNodeIds]
  );
  const onPaneClick = useCallback(() => setSelectedNodeIds([]), [setSelectedNodeIds]);

  return (
    <div className="flex-1 min-h-0">
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        snapToGrid={snapToGrid}
        snapGrid={[FAMILY_TREE_GRID_SIZE, FAMILY_TREE_GRID_SIZE]}
        fitView
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        elementsSelectable
        nodesDraggable
        nodesConnectable={false}
        defaultEdgeOptions={{
          style: { stroke: "#64748b" },
          type: "smoothstep",
        }}
        className="bg-dark-bg"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={FAMILY_TREE_GRID_SIZE}
          size={1}
          color="#0f3460"
          className="bg-dark-bg"
        />
        <Controls
          className="!bg-dark-surface !border-dark-accent !rounded-lg [&>button]:!bg-dark-accent [&>button]:!text-dark-text [&>button]:!border-dark-accent [&>button:hover]:!bg-dark-bg"
        />
      </ReactFlow>
    </div>
  );
}
