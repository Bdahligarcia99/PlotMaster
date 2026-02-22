import { create } from "zustand";
import type { Node, Edge } from "reactflow";

export interface PersonNodeData {
  kind: "person";
  name: string;
  notes: string;
}

export interface UnionNodeData {
  kind: "union";
  partnerIds: [string, string];
  notes: string;
}

export type FamilyTreeNodeData = PersonNodeData | UnionNodeData;

function isPersonData(data: FamilyTreeNodeData): data is PersonNodeData {
  return (data as PersonNodeData).kind === "person";
}

interface FamilyTreeStore {
  nodes: Node<FamilyTreeNodeData>[];
  edges: Edge[];
  selectedNodeIds: string[];
  primarySelectedNodeId: string | null;
  snapToGrid: boolean;
  setNodes: (nodes: Node<FamilyTreeNodeData>[] | ((prev: Node<FamilyTreeNodeData>[]) => Node<FamilyTreeNodeData>[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setSelectedNodeIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  setSnapToGrid: (v: boolean) => void;
  addPerson: () => string;
  createUnion: (partnerNodeIds: [string, string]) => string | null;
  addChild: (unionNodeId: string) => string | null;
  updateNodeName: (nodeId: string, name: string) => void;
  updateNodeNotes: (nodeId: string, notes: string) => void;
}

const generateId = () => `_${Math.random().toString(36).slice(2, 11)}`;

export const useFamilyTreeStore = create<FamilyTreeStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeIds: [],
  primarySelectedNodeId: null,
  snapToGrid: true,

  setNodes: (nodesOrUpdater) =>
    set((s) => ({
      nodes: typeof nodesOrUpdater === "function" ? nodesOrUpdater(s.nodes) : nodesOrUpdater,
    })),

  setEdges: (edgesOrUpdater) =>
    set((s) => ({
      edges: typeof edgesOrUpdater === "function" ? edgesOrUpdater(s.edges) : edgesOrUpdater,
    })),

  setSelectedNodeIds: (idsOrUpdater) =>
    set((s) => {
      const ids = typeof idsOrUpdater === "function" ? idsOrUpdater(s.selectedNodeIds) : idsOrUpdater;
      return { selectedNodeIds: ids, primarySelectedNodeId: ids[0] ?? null };
    }),

  setSnapToGrid: (v) => set({ snapToGrid: v }),

  addPerson: () => {
    const id = generateId();
    const state = get();
    const maxY = state.nodes.reduce((max, n) => Math.max(max, n.position.y), 0);
    const newNode: Node<PersonNodeData> = {
      id,
      type: "person",
      position: { x: Math.random() * 200, y: maxY + 80 },
      data: { kind: "person", name: "New Person", notes: "" },
    };
    set((s) => ({ nodes: [...s.nodes, newNode] }));
    return id;
  },

  createUnion: (partnerNodeIds) => {
    const [idA, idB] = partnerNodeIds;
    const state = get();
    const nodeA = state.nodes.find((n) => n.id === idA);
    const nodeB = state.nodes.find((n) => n.id === idB);
    if (!nodeA || !nodeB) return null;
    const personNodes = [nodeA, nodeB].filter((n) => n.type === "person");
    if (personNodes.length !== 2) return null;

    const unionId = generateId();
    const midX = (nodeA.position.x + nodeB.position.x) / 2;
    const belowY = Math.max(nodeA.position.y, nodeB.position.y) + 70;
    const unionNode: Node<UnionNodeData> = {
      id: unionId,
      type: "union",
      position: { x: midX - 30, y: belowY },
      data: { kind: "union", partnerIds: [idA, idB], notes: "" },
    };

    const partnerEdge1: Edge = {
      id: `e-${idA}-${unionId}`,
      source: idA,
      target: unionId,
      sourceHandle: "partner",
      targetHandle: "partners",
      data: { type: "partner" },
    };
    const partnerEdge2: Edge = {
      id: `e-${idB}-${unionId}`,
      source: idB,
      target: unionId,
      sourceHandle: "partner",
      targetHandle: "partners",
      data: { type: "partner" },
    };

    set((s) => ({
      nodes: [...s.nodes, unionNode],
      edges: [...s.edges, partnerEdge1, partnerEdge2],
      selectedNodeIds: [unionId],
      primarySelectedNodeId: unionId,
    }));
    return unionId;
  },

  addChild: (unionNodeId) => {
    const state = get();
    const unionNode = state.nodes.find((n) => n.id === unionNodeId && n.type === "union");
    if (!unionNode) return null;

    const childId = generateId();
    const newPersonNode: Node<PersonNodeData> = {
      id: childId,
      type: "person",
      position: {
        x: unionNode.position.x,
        y: unionNode.position.y + 160,
      },
      data: { kind: "person", name: "New Person", notes: "" },
    };

    const childEdge: Edge = {
      id: `e-${unionNodeId}-${childId}`,
      source: unionNodeId,
      target: childId,
      sourceHandle: "children",
      targetHandle: "parent",
      data: { type: "child" },
    };

    set((s) => ({
      nodes: [...s.nodes, newPersonNode],
      edges: [...s.edges, childEdge],
      selectedNodeIds: [childId],
      primarySelectedNodeId: childId,
    }));
    return childId;
  },

  updateNodeName: (nodeId, name) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId && isPersonData(n.data)
          ? { ...n, data: { ...(n.data as PersonNodeData), name } }
          : n
      ),
    }));
  },

  updateNodeNotes: (nodeId, notes) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, notes } } : n
      ),
    }));
  },
}));
