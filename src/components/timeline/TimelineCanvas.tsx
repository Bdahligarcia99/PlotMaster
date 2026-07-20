import { useCallback, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type NodeMouseHandler,
  type OnSelectionChangeFunc,
} from "reactflow";
import "reactflow/dist/style.css";
import BeatNode from "./BeatNode";
import LaneHeaderNode from "./LaneHeaderNode";
import { useTimelineStore } from "../../store/timelineStore";
import { TIMELINE_GRID_SIZE } from "../../store/timelineTypes";

const nodeTypes = { beat: BeatNode, lane: LaneHeaderNode };

interface TimelineCanvasProps {
  onNodeSelectForEdit?: () => void;
}

export default function TimelineCanvas({ onNodeSelectForEdit }: TimelineCanvasProps) {
  const nodes = useTimelineStore((s) => s.nodes);
  const edges = useTimelineStore((s) => s.edges);
  const selectedNodeIds = useTimelineStore((s) => s.selectedNodeIds);
  const setSelectedNodeIds = useTimelineStore((s) => s.setSelectedNodeIds);
  const doubleClickIgnoreClearRef = useRef(false);

  const nodesWithSelection = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: selectedNodeIds.includes(n.id),
      })),
    [nodes, selectedNodeIds]
  );

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      if (selectedNodes.length === 0 && doubleClickIgnoreClearRef.current) return;
      setSelectedNodeIds(selectedNodes.map((n) => n.id));
    },
    [setSelectedNodeIds]
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (evt, node) => {
      if (evt.metaKey || evt.ctrlKey || evt.shiftKey) {
        evt.preventDefault();
        evt.stopPropagation();
        setSelectedNodeIds((prev) =>
          prev.includes(node.id) ? prev.filter((id) => id !== node.id) : [...prev, node.id]
        );
      } else {
        setSelectedNodeIds([node.id]);
      }
    },
    [setSelectedNodeIds]
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (evt, node) => {
      evt.preventDefault();
      evt.stopPropagation();
      doubleClickIgnoreClearRef.current = true;
      setSelectedNodeIds([node.id]);
      onNodeSelectForEdit?.();
      setTimeout(() => {
        doubleClickIgnoreClearRef.current = false;
      }, 100);
    },
    [setSelectedNodeIds, onNodeSelectForEdit]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeIds([]);
  }, [setSelectedNodeIds]);

  return (
    <div className="flex-1 min-h-0 bg-dark-bg/50">
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={1.5}
        defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#64748b" } }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={TIMELINE_GRID_SIZE} color="#334155" />
        <Controls className="!bg-dark-surface !border-dark-accent !shadow-none [&>button]:!bg-dark-surface [&>button]:!border-dark-accent [&>button]:!text-dark-muted" />
        <MiniMap
          className="!bg-dark-surface !border-dark-accent"
          nodeColor={(n) => (n.type === "lane" ? "#475569" : "#3b82f6")}
        />
      </ReactFlow>
    </div>
  );
}
