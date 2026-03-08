import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  useStore,
  useReactFlow,
  type OnNodesChange,
  type OnEdgesChange,
  type OnSelectionChangeFunc,
  type NodeMouseHandler,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import {
  FAMILY_TREE_GRID_SIZE,
  DEFAULT_PERSON_W,
  DEFAULT_PERSON_H,
  DEFAULT_UNION_W,
  DEFAULT_UNION_H,
  getAnchorAtY,
  formatGenerationAnchorLabel,
} from "../../store/familyTreeStore";
import PersonNode from "./PersonNode";
import UnionNode from "./UnionNode";
import GenerationAnchorsOverlay from "./GenerationAnchorsOverlay";
import GenerationRuler from "./GenerationRuler";
import NodeSpacingOverlay from "./NodeSpacingOverlay";
import Modal from "../ui/Modal";

function ViewportBoundsSync() {
  const setViewportBounds = useFamilyTreeStore((s) => s.setViewportBounds);
  const { screenToFlowPosition } = useReactFlow();
  const domNode = useStore((s) => s.domNode);
  const transform = useStore((s) => s.transform);

  useEffect(() => {
    if (!domNode) return;
    const update = () => {
      const rect = domNode.getBoundingClientRect();
      const topLeft = screenToFlowPosition({ x: rect.left, y: rect.top });
      const bottomRight = screenToFlowPosition({ x: rect.right, y: rect.bottom });
      setViewportBounds({
        minX: Math.min(topLeft.x, bottomRight.x),
        minY: Math.min(topLeft.y, bottomRight.y),
        maxX: Math.max(topLeft.x, bottomRight.x),
        maxY: Math.max(topLeft.y, bottomRight.y),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(domNode);
    return () => {
      observer.disconnect();
      setViewportBounds(null);
    };
  }, [domNode, transform, screenToFlowPosition, setViewportBounds]);

  return null;
}

const nodeTypes = { person: PersonNode, union: UnionNode };

function rectsIntersect(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function MarqueeOverlay({ isSpacePanning }: { isSpacePanning: boolean }) {
  const { screenToFlowPosition, flowToScreenPosition } = useReactFlow();
  const domNode = useStore((s) => s.domNode);
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const nodeSizesById = useFamilyTreeStore((s) => s.nodeSizesById);
  const setSelectedNodeIds = useFamilyTreeStore((s) => s.setSelectedNodeIds);

  const [drag, setDrag] = useState<{
    startFlow: { x: number; y: number };
    currentFlow: { x: number; y: number };
    mode: "replace" | "add" | "subtract";
  } | null>(null);

  const shiftRef = useRef(false);
  const altRef = useRef(false);

  const getDragMode = () =>
    shiftRef.current ? "add" : altRef.current ? "subtract" : "replace";

  useEffect(() => {
    if (isSpacePanning) {
      setDrag(null);
      document.body.style.userSelect = "";
    }
  }, [isSpacePanning]);

  useEffect(() => {
    if (!drag) return;

    const handlePointerMove = (e: PointerEvent) => {
      shiftRef.current = e.shiftKey;
      altRef.current = e.altKey;
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const mode = shiftRef.current ? "add" : altRef.current ? "subtract" : "replace";
      setDrag((d) => (d ? { ...d, currentFlow: flowPos, mode } : null));
    };

    const handlePointerUp = (e: PointerEvent) => {
      shiftRef.current = e.shiftKey;
      altRef.current = e.altKey;
      document.body.style.userSelect = "";
      setDrag((d) => {
        if (!d) return null;

        const minX = Math.min(d.startFlow.x, d.currentFlow.x);
        const maxX = Math.max(d.startFlow.x, d.currentFlow.x);
        const minY = Math.min(d.startFlow.y, d.currentFlow.y);
        const maxY = Math.max(d.startFlow.y, d.currentFlow.y);
        const selW = maxX - minX;
        const selH = maxY - minY;

        const intersectingIds: string[] = [];
        for (const n of nodes) {
          const w =
            n.type === "person"
              ? nodeSizesById[n.id]?.width ?? DEFAULT_PERSON_W
              : nodeSizesById[n.id]?.width ?? DEFAULT_UNION_W;
          const h =
            n.type === "person"
              ? nodeSizesById[n.id]?.height ?? DEFAULT_PERSON_H
              : nodeSizesById[n.id]?.height ?? DEFAULT_UNION_H;

          if (rectsIntersect(minX, minY, selW, selH, n.position.x, n.position.y, w, h)) {
            intersectingIds.push(n.id);
          }
        }

        const marqueeHits = new Set(intersectingIds);
        const shift = shiftRef.current;
        const alt = altRef.current;

        let nextSelection: string[];
        if (shift) {
          const currentSelection = useFamilyTreeStore.getState().selectedNodeIds;
          nextSelection = [...new Set([...currentSelection, ...marqueeHits])];
        } else if (alt) {
          const currentSelection = useFamilyTreeStore.getState().selectedNodeIds;
          nextSelection = currentSelection.filter((id) => !marqueeHits.has(id));
        } else {
          nextSelection = intersectingIds;
        }

        setSelectedNodeIds(nextSelection);

        return null;
      });

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [drag, nodes, nodeSizesById, screenToFlowPosition, setSelectedNodeIds]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      shiftRef.current = e.shiftKey;
      altRef.current = e.altKey;

      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      for (const n of nodes) {
        const w =
          n.type === "person"
            ? nodeSizesById[n.id]?.width ?? DEFAULT_PERSON_W
            : nodeSizesById[n.id]?.width ?? DEFAULT_UNION_W;
        const h =
          n.type === "person"
            ? nodeSizesById[n.id]?.height ?? DEFAULT_PERSON_H
            : nodeSizesById[n.id]?.height ?? DEFAULT_UNION_H;

        if (
          flowPos.x >= n.position.x &&
          flowPos.x <= n.position.x + w &&
          flowPos.y >= n.position.y &&
          flowPos.y <= n.position.y + h
        ) {
          return;
        }
      }

      document.body.style.userSelect = "none";
      setDrag({
        startFlow: flowPos,
        currentFlow: flowPos,
        mode: getDragMode(),
      });
    },
    [nodes, nodeSizesById, screenToFlowPosition]
  );

  if (!domNode) return null;

  const rect = domNode.getBoundingClientRect();

  if (isSpacePanning) return null;

  return (
    <div
      className="absolute inset-0 z-10 cursor-crosshair"
      onPointerDown={handlePointerDown}
    >
      {drag && (() => {
        const minX = Math.min(drag.startFlow.x, drag.currentFlow.x);
        const minY = Math.min(drag.startFlow.y, drag.currentFlow.y);
        const maxX = Math.max(drag.startFlow.x, drag.currentFlow.x);
        const maxY = Math.max(drag.startFlow.y, drag.currentFlow.y);
        const topLeft = flowToScreenPosition({ x: minX, y: minY });
        const bottomRight = flowToScreenPosition({ x: maxX, y: maxY });
        const left = Math.min(topLeft.x, bottomRight.x) - rect.left;
        const top = Math.min(topLeft.y, bottomRight.y) - rect.top;
        const width = Math.abs(bottomRight.x - topLeft.x);
        const height = Math.abs(bottomRight.y - topLeft.y);

        const modeLabel =
          drag.mode === "add"
            ? "Add"
            : drag.mode === "subtract"
              ? "Subtract"
              : "Replace";

        return (
          <>
            <div
              className="absolute bg-blue-500/20 border border-blue-400/80 pointer-events-none"
              style={{
                left,
                top,
                width: Math.max(1, width),
                height: Math.max(1, height),
              }}
            />
            <div
              className="absolute text-[10px] text-blue-300/90 font-medium pointer-events-none whitespace-nowrap"
              style={{
                left: left + 4,
                top: top - 16,
              }}
            >
              {modeLabel}
            </div>
          </>
        );
      })()}
    </div>
  );
}

export interface FamilyTreeCanvasProps {
  panOnDrag?: boolean;
  nodesDraggable?: boolean;
  marqueeToolActive?: boolean;
  isSpacePanning?: boolean;
}

export default function FamilyTreeCanvas({
  panOnDrag = true,
  nodesDraggable = true,
  marqueeToolActive = false,
  isSpacePanning = false,
}: FamilyTreeCanvasProps = {}) {
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    setSelectedNodeIds,
    selectedNodeIds,
    snapToGrid,
    nodeSizesById,
    generationAnchors,
    genLabelMode,
    updateNodeGenAnchor,
    setGenInheritFlash,
    setPendingGenChangePrompt,
    setNodeGenArmed,
  } = useFamilyTreeStore();

  const dragStartRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const onNodeDragStart = useCallback(
    (_: React.MouseEvent, node: { id: string; position: { x: number; y: number }; data: { kind?: string; isGenArmed?: boolean } }) => {
      dragStartRef.current.set(node.id, { x: node.position.x, y: node.position.y });
      if (node.data?.kind === "person" && node.data?.isGenArmed === false) setNodeGenArmed(node.id);
    },
    [setNodeGenArmed]
  );

  const onNodeDragStop = useCallback(
    (
      _: React.MouseEvent,
      node: { id: string; position: { x: number; y: number }; data: { kind?: string; isGenArmed?: boolean; genAnchorId?: string | null; name?: string } }
    ) => {
      if (node.data?.kind !== "person") return;
      const prevPos = dragStartRef.current.get(node.id);
      dragStartRef.current.delete(node.id);
      if (!prevPos) return;

      const storeNode = useFamilyTreeStore.getState().nodes.find((n) => n.id === node.id);
      const rawArmed = (storeNode?.data ?? node.data) as { isGenArmed?: boolean };
      const isGenArmed = rawArmed.isGenArmed ?? true;
      if (!isGenArmed) return;

      const height = nodeSizesById[node.id]?.height ?? DEFAULT_PERSON_H;
      const centerY = node.position.y + height / 2;
      const targetAnchor = getAnchorAtY(generationAnchors, centerY);
      const currentGen = (node.data as { genAnchorId?: string | null }).genAnchorId ?? null;
      const nodeName = (node.data as { name?: string }).name || "New Person";

      if (targetAnchor) {
        if (!currentGen) {
          updateNodeGenAnchor(node.id, targetAnchor.id);
          const inheritLabel = formatGenerationAnchorLabel(targetAnchor, genLabelMode);
          setGenInheritFlash(node.id, inheritLabel);
        } else if (currentGen !== targetAnchor.id) {
          const fromAnchor = generationAnchors.find((a) => a.id === currentGen);
          const fromLabel = fromAnchor
            ? formatGenerationAnchorLabel(fromAnchor, genLabelMode)
            : "?";
          const toLabel = formatGenerationAnchorLabel(targetAnchor, genLabelMode);
          setPendingGenChangePrompt({
            nodeId: node.id,
            nodeName,
            fromAnchorId: currentGen,
            toAnchorId: targetAnchor.id,
            fromLabel,
            toLabel,
            previousPosition: prevPos,
          });
        }
      }
    },
    [
      generationAnchors,
      genLabelMode,
      nodeSizesById,
      updateNodeGenAnchor,
      setGenInheritFlash,
      setPendingGenChangePrompt,
    ]
  );

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
      if (node.data?.kind === "person" && (node.data as { isGenArmed?: boolean }).isGenArmed === false) setNodeGenArmed(node.id);
      if (evt.metaKey || evt.ctrlKey || evt.shiftKey) {
        evt.preventDefault();
        evt.stopPropagation();
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
    [setSelectedNodeIds, setNodeGenArmed]
  );
  const onPaneClick = useCallback(() => setSelectedNodeIds([]), [setSelectedNodeIds]);

  const showSpacePanCursor = marqueeToolActive && isSpacePanning;

  const pendingGenChangePrompt = useFamilyTreeStore((s) => s.pendingGenChangePrompt);
  const resolveGenChangePrompt = useFamilyTreeStore((s) => s.resolveGenChangePrompt);

  return (
    <div
      className={`flex-1 min-h-0 ${showSpacePanCursor ? "cursor-grab [&.panning]:cursor-grabbing" : ""}`}
      onPointerDown={(e) => {
        if (showSpacePanCursor && e.button === 0) {
          (e.currentTarget as HTMLElement).classList.add("panning");
        }
      }}
      onPointerUp={(e) => {
        (e.currentTarget as HTMLElement).classList.remove("panning");
      }}
      onPointerLeave={(e) => {
        (e.currentTarget as HTMLElement).classList.remove("panning");
      }}
    >
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        snapToGrid={snapToGrid}
        snapGrid={[FAMILY_TREE_GRID_SIZE, FAMILY_TREE_GRID_SIZE]}
        fitView
        panOnDrag={panOnDrag}
        zoomOnScroll
        zoomOnPinch
        elementsSelectable
        nodesDraggable={nodesDraggable}
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
        <ViewportBoundsSync />
        <GenerationAnchorsOverlay />
        <GenerationRuler />
        <NodeSpacingOverlay />
        {marqueeToolActive && <MarqueeOverlay isSpacePanning={isSpacePanning} />}
      </ReactFlow>
      <Modal
        isOpen={!!pendingGenChangePrompt}
        onClose={() => resolveGenChangePrompt("cancel")}
        title="Update Generation?"
      >
        {pendingGenChangePrompt && (
          <>
            <p className="text-dark-text mb-4">
              Move {pendingGenChangePrompt.nodeName} from Gen {pendingGenChangePrompt.fromLabel} → Gen{" "}
              {pendingGenChangePrompt.toLabel}?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => resolveGenChangePrompt("cancel")}
                className="px-3 py-1.5 text-sm rounded border border-dark-accent/50 hover:bg-dark-accent/30 text-dark-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => resolveGenChangePrompt("update")}
                className="px-3 py-1.5 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white"
              >
                Update Generation
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
