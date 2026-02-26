import { create } from "zustand";
import type { Node, Edge } from "reactflow";
import { getStorageDriver } from "../storage/StorageDriver";

/** Grid size for Family Tree canvas. Must match snapGrid in FamilyTreeCanvas. */
export const FAMILY_TREE_GRID_SIZE = 16;

/** Sort v1 layout constants. */
export const PARTNER_DX = 224;
export const UNION_DY = 96;
export const CHILD_DY = 208;
/** Child row: gap shrinks with more children (max 224, min 8). */
export const CHILD_MAX_GAP = 224;
export const CHILD_MIN_GAP = 8;

/** Default node dimensions when measured size unavailable (from component min-w). */
export const DEFAULT_PERSON_W = 120;
export const DEFAULT_PERSON_H = 72;
export const DEFAULT_UNION_W = 60;
export const DEFAULT_UNION_H = 40;

export function snapPosition(
  x: number,
  y: number,
  enabled: boolean
): { x: number; y: number } {
  if (!enabled) return { x, y };
  const g = FAMILY_TREE_GRID_SIZE;
  return {
    x: Math.round(x / g) * g,
    y: Math.round(y / g) * g,
  };
}

export interface PersonNodeData {
  kind: "person";
  name: string;
  notes: string;
}

export interface UnionNodeData {
  kind: "union";
  partnerIds: [string, string];
  leftPartnerId?: string;
  rightPartnerId?: string;
  notes: string;
}

export type FamilyTreeNodeData = PersonNodeData | UnionNodeData;

export interface FamilyTreeSavedState {
  nodes: Node<FamilyTreeNodeData>[];
  edges: Edge[];
  anchorNodeId: string | null;
  uiFlags?: { snapToGrid?: boolean; showCoordinates?: boolean };
  ui?: {
    showCoordinatesEnabled?: boolean;
    showNodeInfoEnabled?: boolean;
    singleChildAlignment?: "left" | "center" | "right";
    childrenRowAlignment3Plus?: "left" | "center" | "right";
    coordModeTopLeft?: boolean;
    coordModeCenter?: boolean;
    nodeInfoTopLeft?: boolean;
    nodeInfoCenter?: boolean;
    nodeInfoSize?: boolean;
    scriptPanelLayout?: "split" | "codeOnly" | "viewOnly";
  };
}

function isPersonData(data: FamilyTreeNodeData): data is PersonNodeData {
  return (data as PersonNodeData).kind === "person";
}

/** Compute generation map from nodes/edges. 0 = Gen A, 1 = Gen B, etc. Derived, not stored. */
export function computeGenerations(
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): Record<string, number> {
  const personIds = new Set(
    nodes.filter((n) => n.data.kind === "person").map((n) => n.id)
  );
  const unionById = new Map(
    nodes.filter((n) => n.type === "union").map((n) => [n.id, n])
  );

  // parentsOf[childId] = parent person ids
  const parentsOf: Record<string, string[]> = {};
  for (const edge of edges) {
    if ((edge.data as { type?: string })?.type !== "child") continue;
    const unionNode = unionById.get(edge.source);
    if (!unionNode || (unionNode.data as UnionNodeData).kind !== "union")
      continue;
    const partnerIds = (unionNode.data as UnionNodeData).partnerIds;
    const childId = edge.target;
    if (personIds.has(childId)) {
      if (!parentsOf[childId]) parentsOf[childId] = [];
      for (const pid of partnerIds) {
        if (personIds.has(pid) && !parentsOf[childId].includes(pid)) {
          parentsOf[childId].push(pid);
        }
      }
    }
  }

  const gen: Record<string, number> = {};
  for (const id of personIds) {
    if (!parentsOf[id]) gen[id] = 0;
  }

  let changed = true;
  let iterations = 0;
  const maxIterations = personIds.size;
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    for (const id of personIds) {
      const parents = parentsOf[id];
      if (!parents?.length) continue;
      const parentGens = parents.map((p) => gen[p]);
      if (parentGens.some((g) => g === undefined)) continue;
      const maxParentGen = Math.max(...(parentGens as number[]));
      const newGen = maxParentGen + 1;
      if (gen[id] !== newGen) {
        gen[id] = newGen;
        changed = true;
      }
    }
  }

  return gen;
}

/** Format generation number as "Gen A", "Gen B", etc. Unknown => "Gen —" */
export function formatGeneration(gen: number | undefined): string {
  if (gen === undefined || gen < 0) return "Gen —";
  if (gen < 26) return `Gen ${String.fromCharCode(65 + gen)}`;
  return `Gen ${gen + 1}`;
}

/** Child edges use edge.data.type === 'child' (see addChild). */
export function isChildEdge(edge: Edge): boolean {
  return (edge.data as { type?: string })?.type === "child";
}

/** True if person is target of any child edge (i.e. has parents / is already a child). */
export function hasParents(edges: Edge[], personId: string): boolean {
  return edges.some((e) => isChildEdge(e) && e.target === personId);
}

/**
 * Generate read-only script text from current Family Tree graph.
 * One-way: canvas -> script. Deterministic, stable ordering.
 * @param compactDeclarations - when true, render declarations as comma-separated Name(id) on one line
 * @param showNodeInfo - when true and not compact, append x/y, cx/cy, w/h per node based on toggles
 */
export function generateFamilyTreeScript(
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[],
  options?: {
    compactDeclarations?: boolean;
    showNodeInfo?: boolean;
    nodeInfoTopLeft?: boolean;
    nodeInfoCenter?: boolean;
    nodeInfoSize?: boolean;
    nodeSizesById?: Record<string, { width: number; height: number }>;
  }
): string {
  const compactDeclarations = options?.compactDeclarations ?? false;
  const showNodeInfo = options?.showNodeInfo ?? false;
  const nodeInfoTopLeft = options?.nodeInfoTopLeft ?? true;
  const nodeInfoCenter = options?.nodeInfoCenter ?? false;
  const nodeInfoSize = options?.nodeInfoSize ?? false;
  const nodeSizesById = options?.nodeSizesById ?? {};

  const personNodes = nodes
    .filter((n): n is Node<PersonNodeData> => n.data.kind === "person")
    .sort((a, b) => {
      const nameA = (a.data.name || "").toLowerCase();
      const nameB = (b.data.name || "").toLowerCase();
      const cmp = nameA.localeCompare(nameB);
      if (cmp !== 0) return cmp;
      return a.id.localeCompare(b.id);
    });

  const unionNodes = nodes
    .filter(
      (n): n is Node<UnionNodeData> =>
        n.type === "union" && (n.data as UnionNodeData).kind === "union"
    )
    .sort((a, b) => {
      const yA = a.position.y;
      const yB = b.position.y;
      if (yA !== yB) return yA - yB;
      const xA = a.position.x;
      const xB = b.position.x;
      if (xA !== xB) return xA - xB;
      return a.id.localeCompare(b.id);
    });

  const personById = new Map(personNodes.map((n) => [n.id, n]));
  const getName = (id: string) => (personById.get(id)?.data as PersonNodeData)?.name ?? id;

  const lines: string[] = [];

  const getSize = (id: string, isUnion: boolean) => {
    const sz = nodeSizesById[id];
    if (sz) return { w: Math.round(sz.width), h: Math.round(sz.height) };
    return isUnion
      ? { w: DEFAULT_UNION_W, h: DEFAULT_UNION_H }
      : { w: DEFAULT_PERSON_W, h: DEFAULT_PERSON_H };
  };

  const getInlineInfo = (
    node: { position: { x: number; y: number } },
    id: string,
    isUnion: boolean
  ): string => {
    const { w, h } = getSize(id, isUnion);
    const cx = Math.round(node.position.x + w / 2);
    const cy = Math.round(node.position.y + h / 2);
    const parts: string[] = [];
    if (nodeInfoTopLeft) {
      parts.push(`x:${Math.round(node.position.x)} y:${Math.round(node.position.y)}`);
    }
    if (nodeInfoCenter) {
      parts.push(`cx:${cx} cy:${cy}`);
    }
    if (nodeInfoSize) {
      parts.push(`w:${w} h:${h}`);
    }
    return parts.length > 0 ? ` [${parts.join(" | ")}]` : "";
  };

  lines.push("@declarations");
  if (compactDeclarations) {
    if (showNodeInfo) {
      const tokens = personNodes.map((n) => {
        const base = `${n.data.name || "New Person"}(${n.id})`;
        return base + getInlineInfo(n, n.id, false);
      });
      const unionTokens = unionNodes.map((u) => {
        const base = `Union ${u.id}`;
        return base + getInlineInfo(u, u.id, true);
      });
      lines.push([...tokens, ...unionTokens].join(", "));
    } else {
      const tokens = personNodes.map(
        (n) => `${n.data.name || "New Person"}(${n.id})`
      );
      lines.push(tokens.join(", "));
    }
  } else if (showNodeInfo) {
    const pushBlockLines = (
      node: { position: { x: number; y: number } },
      id: string,
      isUnion: boolean
    ) => {
      const { w, h } = getSize(id, isUnion);
      const cx = Math.round(node.position.x + w / 2);
      const cy = Math.round(node.position.y + h / 2);
      if (nodeInfoTopLeft) {
        lines.push(`  x: ${Math.round(node.position.x)}`);
        lines.push(`  y: ${Math.round(node.position.y)}`);
      }
      if (nodeInfoCenter) {
        lines.push(`  cx: ${cx}`);
        lines.push(`  cy: ${cy}`);
      }
      if (nodeInfoSize) {
        lines.push(`  w: ${w}`);
        lines.push(`  h: ${h}`);
      }
    };
    for (const n of personNodes) {
      const name = n.data.name || "New Person";
      lines.push(`${name} (${n.id})`);
      pushBlockLines(n, n.id, false);
      lines.push("");
    }
    for (const u of unionNodes) {
      lines.push(`Union ${u.id}`);
      pushBlockLines(u, u.id, true);
      lines.push("");
    }
    if (personNodes.length > 0 || unionNodes.length > 0) {
      lines.pop();
    }
  } else {
    for (const n of personNodes) {
      lines.push(`[${n.data.name || "New Person"}] # id: ${n.id}`);
    }
  }
  lines.push("");
  lines.push("@familyTree");
  lines.push("");

  const validUnions = unionNodes.filter((union) => {
    const data = union.data as UnionNodeData;
    const leftId = data.leftPartnerId ?? data.partnerIds?.[0];
    const rightId = data.rightPartnerId ?? data.partnerIds?.[1];
    return !!(
      leftId &&
      rightId &&
      personById.has(leftId) &&
      personById.has(rightId)
    );
  });

  for (const union of validUnions) {
    const data = union.data as UnionNodeData;
    const leftId = data.leftPartnerId ?? data.partnerIds?.[0]!;
    const rightId = data.rightPartnerId ?? data.partnerIds?.[1]!;
    const leftName = getName(leftId);
    const rightName = getName(rightId);

    const childIds = edges
      .filter((e) => e.source === union.id && isChildEdge(e))
      .map((e) => e.target)
      .filter((id) => personById.has(id));

    const childNodes = childIds
      .map((id) => personById.get(id)!)
      .sort((a, b) => {
        if (a.position.x !== b.position.x) return a.position.x - b.position.x;
        const na = (a.data.name || "").toLowerCase();
        const nb = (b.data.name || "").toLowerCase();
        const cmp = na.localeCompare(nb);
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id);
      });

    const childNames = childNodes.map((n) => n.data.name || "New Person");

    if (childNames.length > 0) {
      lines.push(`@${union.id}: ${leftName} <=> ${rightName} {`);
      lines.push(`  children: ${childNames.join(", ")}`);
      lines.push("}");
    } else {
      lines.push(`@${union.id}: ${leftName} <=> ${rightName}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Compute next Person N: max existing "Person {N}" + 1, or 1 if none. */
function nextPersonNumber(nodes: Node<FamilyTreeNodeData>[]): number {
  let max = 0;
  const personNodes = nodes.filter((n) => (n.data as { kind?: string }).kind === "person");
  for (const n of personNodes) {
    const name = (n.data as PersonNodeData).name;
    const m = name?.match(/^Person (\d+)$/);
    if (m) {
      const num = parseInt(m[1]!, 10);
      if (num > max) max = num;
    }
  }
  return max + 1;
}


const PLACEMENT_NODE_WIDTH = 200;
const PLACEMENT_NODE_HEIGHT = 72;
const NEAR_THRESHOLD_DX = 180;
const NEAR_THRESHOLD_DY = 110;

function isNearExisting(x: number, y: number, nodes: Node<FamilyTreeNodeData>[]): boolean {
  for (const n of nodes) {
    const dx = Math.abs(x - n.position.x);
    const dy = Math.abs(y - n.position.y);
    if (dx < NEAR_THRESHOLD_DX && dy < NEAR_THRESHOLD_DY) return true;
  }
  return false;
}

export function isSpotFree(
  x: number,
  y: number,
  nodes: Node<FamilyTreeNodeData>[],
  ignoreIds: string[] = []
): boolean {
  const ignore = new Set(ignoreIds);
  const candidateRight = x + PLACEMENT_NODE_WIDTH;
  const candidateBottom = y + PLACEMENT_NODE_HEIGHT;

  for (const n of nodes) {
    if (ignore.has(n.id)) continue;
    const nr = n.position.x + PLACEMENT_NODE_WIDTH;
    const nb = n.position.y + PLACEMENT_NODE_HEIGHT;
    const overlaps =
      x < nr && candidateRight > n.position.x && y < nb && candidateBottom > n.position.y;
    if (overlaps) return false;
  }
  return true;
}

interface FamilyTreeStore {
  nodes: Node<FamilyTreeNodeData>[];
  edges: Edge[];
  activeProjectId: string | null;
  nodeSizesById: Record<string, { width: number; height: number }>;
  selectedNodeIds: string[];
  primarySelectedNodeId: string | null;
  anchorNodeId: string | null;
  viewportBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  snapToGrid: boolean;
  showNodeInfoEnabled: boolean;
  nodeInfoTopLeft: boolean;
  nodeInfoCenter: boolean;
  nodeInfoSize: boolean;
  singleChildAlignment: "left" | "center" | "right";
  childrenRowAlignment3Plus: "left" | "center" | "right";
  persistUnionSelectionOnChildCreate: boolean;
  scriptPanelLayout: "split" | "codeOnly" | "viewOnly";
  marqueeToolActive: boolean;
  isSpacePanning: boolean;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  lastSavedAt: number | null;
  lastSaveError: string | null;
  autosaveEnabled: boolean;
  reportNodeSize: (nodeId: string, size: { width: number; height: number }) => void;
  setNodes: (nodes: Node<FamilyTreeNodeData>[] | ((prev: Node<FamilyTreeNodeData>[]) => Node<FamilyTreeNodeData>[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setSelectedNodeIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  setAnchorNodeId: (id: string | null) => void;
  setViewportBounds: (bounds: { minX: number; minY: number; maxX: number; maxY: number } | null) => void;
  setSnapToGrid: (v: boolean) => void;
  setShowNodeInfoEnabled: (v: boolean) => void;
  setNodeInfoTopLeft: (v: boolean) => void;
  setNodeInfoCenter: (v: boolean) => void;
  setNodeInfoSize: (v: boolean) => void;
  setSingleChildAlignment: (v: "left" | "center" | "right") => void;
  setChildrenRowAlignment3Plus: (v: "left" | "center" | "right") => void;
  setPersistUnionSelectionOnChildCreate: (v: boolean) => void;
  setScriptPanelLayout: (v: "split" | "codeOnly" | "viewOnly") => void;
  setMarqueeToolActive: (v: boolean) => void;
  setIsSpacePanning: (v: boolean) => void;
  setAutosaveEnabled: (v: boolean) => void;
  addPerson: () => string;
  createUnion: (partnerNodeIds: [string, string]) => string | null;
  addChild: (unionNodeId: string) => string | null;
  updateNodeName: (nodeId: string, name: string) => void;
  updateNodeNotes: (nodeId: string, notes: string) => void;
  swapUnionPartners: (unionId: string) => boolean;
  loadTree: (projectId: string) => Promise<{ hadData: boolean }>;
  saveTree: () => Promise<boolean>;
  flushSaveAndSave: () => Promise<boolean>;
  clearTree: (projectId?: string) => void;
}

const generateId = () => `_${Math.random().toString(36).slice(2, 11)}`;

let saveDebounce: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 300;
let prevNodes: Node<FamilyTreeNodeData>[] | null = null;
let prevEdges: Edge[] | null = null;
let prevShowNodeInfoEnabled: boolean | null = null;
let prevNodeInfoTopLeft: boolean | null = null;
let prevNodeInfoCenter: boolean | null = null;
let prevNodeInfoSize: boolean | null = null;
let prevSingleChildAlignment: "left" | "center" | "right" | null = null;
let prevChildrenRowAlignment3Plus: "left" | "center" | "right" | null = null;
let prevPersistUnionSelectionOnChildCreate: boolean | null = null;
let prevScriptPanelLayout: "split" | "codeOnly" | "viewOnly" | null = null;

export const useFamilyTreeStore = create<FamilyTreeStore>((set, get) => ({
  nodes: [],
  edges: [],
  activeProjectId: null,
  nodeSizesById: {},
  selectedNodeIds: [],
  primarySelectedNodeId: null,
  anchorNodeId: null,
  viewportBounds: null as { minX: number; minY: number; maxX: number; maxY: number } | null,
  snapToGrid: true,
  showNodeInfoEnabled: false,
  nodeInfoTopLeft: true,
  nodeInfoCenter: false,
  nodeInfoSize: false,
  singleChildAlignment: "left",
  childrenRowAlignment3Plus: "center",
  persistUnionSelectionOnChildCreate: true,
  scriptPanelLayout: "split",
  marqueeToolActive: false,
  isSpacePanning: false,
  hasUnsavedChanges: false,
  isSaving: false,
  lastSavedAt: null,
  lastSaveError: null,
  autosaveEnabled: true,

  setSnapToGrid: (v) => set({ snapToGrid: v }),
  setShowNodeInfoEnabled: (v) =>
    set({ showNodeInfoEnabled: v, hasUnsavedChanges: true, lastSaveError: null }),
  setNodeInfoTopLeft: (v) =>
    set((s) => {
      if (!v && !s.nodeInfoCenter && !s.nodeInfoSize) return {};
      return { nodeInfoTopLeft: v, hasUnsavedChanges: true, lastSaveError: null };
    }),
  setNodeInfoCenter: (v) =>
    set((s) => {
      if (!v && !s.nodeInfoTopLeft && !s.nodeInfoSize) return {};
      return { nodeInfoCenter: v, hasUnsavedChanges: true, lastSaveError: null };
    }),
  setNodeInfoSize: (v) =>
    set((s) => {
      if (!v && !s.nodeInfoTopLeft && !s.nodeInfoCenter) return {};
      return { nodeInfoSize: v, hasUnsavedChanges: true, lastSaveError: null };
    }),
  setSingleChildAlignment: (v) => set({ singleChildAlignment: v, hasUnsavedChanges: true, lastSaveError: null }),
  setChildrenRowAlignment3Plus: (v) =>
    set({ childrenRowAlignment3Plus: v, hasUnsavedChanges: true, lastSaveError: null }),
  setPersistUnionSelectionOnChildCreate: (v) =>
    set({ persistUnionSelectionOnChildCreate: v, hasUnsavedChanges: true, lastSaveError: null }),
  setScriptPanelLayout: (v) =>
    set({ scriptPanelLayout: v, hasUnsavedChanges: true, lastSaveError: null }),
  setMarqueeToolActive: (v) => set({ marqueeToolActive: v }),
  setIsSpacePanning: (v) => set({ isSpacePanning: v }),
  setAutosaveEnabled: (v) => {
    if (!v && saveDebounce) {
      clearTimeout(saveDebounce);
      saveDebounce = null;
    }
    set({ autosaveEnabled: v });
  },
  setAnchorNodeId: (id) => set({ anchorNodeId: id }),
  setViewportBounds: (bounds) => set({ viewportBounds: bounds }),
  reportNodeSize: (nodeId, size) =>
    set((s) => ({
      nodeSizesById: { ...s.nodeSizesById, [nodeId]: { width: size.width, height: size.height } },
    })),

  setNodes: (nodesOrUpdater) =>
    set((s) => ({
      nodes: typeof nodesOrUpdater === "function" ? nodesOrUpdater(s.nodes) : nodesOrUpdater,
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),

  setEdges: (edgesOrUpdater) =>
    set((s) => ({
      edges: typeof edgesOrUpdater === "function" ? edgesOrUpdater(s.edges) : edgesOrUpdater,
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),

  setSelectedNodeIds: (idsOrUpdater) =>
    set((s) => {
      const ids = typeof idsOrUpdater === "function" ? idsOrUpdater(s.selectedNodeIds) : idsOrUpdater;
      return { selectedNodeIds: ids, primarySelectedNodeId: ids[0] ?? null };
    }),

  addPerson: () => {
    const id = generateId();
    const state = get();
    const { nodes, anchorNodeId, viewportBounds, snapToGrid } = state;

    const tryPosition = (x: number, y: number) =>
      snapToGrid ? snapPosition(x, y, true) : { x, y };

    const findFreeSlot = (baseX: number, baseY: number, ignoreIds: string[] = []) => {
      const spacingX = 224;
      const maxSteps = 10;
      for (let k = 0; k < maxSteps; k++) {
        const step = Math.floor(k / 2) + 1;
        const sign = k % 2 === 0 ? 1 : -1;
        const offset = step * spacingX * sign;
        const cand = tryPosition(baseX + offset, baseY);
        if (isSpotFree(cand.x, cand.y, nodes, ignoreIds)) return cand;
      }
      return tryPosition(baseX + spacingX, baseY);
    };

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    let position: { x: number; y: number };
    if (anchorNodeId) {
      const anchor = nodes.find((n) => n.id === anchorNodeId);
      if (!anchor) {
        const maxY = nodes.reduce((max, n) => Math.max(max, n.position.y), 0);
        position = tryPosition(Math.random() * 200, maxY + 80);
      } else {
        position = findFreeSlot(anchor.position.x, anchor.position.y, [anchorNodeId]);
      }
    } else if (viewportBounds) {
      const marginX = 120;
      const marginY = 100;
      const { minX, minY, maxX, maxY } = viewportBounds;
      const spanX = Math.max(0, maxX - minX - 2 * marginX);
      const spanY = Math.max(0, maxY - minY - 2 * marginY);
      const randomX = spanX > 0 ? lerp(minX + marginX, maxX - marginX, Math.random()) : minX + marginX;
      const randomY = spanY > 0 ? lerp(minY + marginY, maxY - marginY, Math.random()) : minY + marginY;

      const offsetStep = snapToGrid ? FAMILY_TREE_GRID_SIZE : 28;
      const maxAttempts = 12;
      let candidateX = randomX;
      let candidateY = randomY;
      for (let i = 0; i < maxAttempts; i++) {
        candidateX = randomX + i * offsetStep;
        candidateY = randomY + i * offsetStep;
        if (!isNearExisting(candidateX, candidateY, nodes)) break;
      }
      position = tryPosition(candidateX, candidateY);
    } else {
      const maxY = nodes.reduce((max, n) => Math.max(max, n.position.y), 0);
      position = tryPosition(Math.random() * 200, maxY + 80);
    }

    const nextNum = nextPersonNumber(nodes);
    const newNode: Node<PersonNodeData> = {
      id,
      type: "person",
      position,
      data: { kind: "person", name: `Person ${nextNum}`, notes: "" },
    };
    set((s) => ({ nodes: [...s.nodes, newNode], hasUnsavedChanges: true, lastSaveError: null }));
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
    const [leftId, rightId] =
      nodeA.position.x <= nodeB.position.x ? [idA, idB] : [idB, idA];
    const midX = (nodeA.position.x + nodeB.position.x) / 2;
    const belowY = Math.max(nodeA.position.y, nodeB.position.y) + 70;
    const unionNode: Node<UnionNodeData> = {
      id: unionId,
      type: "union",
      position: { x: midX - 30, y: belowY },
      data: {
        kind: "union",
        partnerIds: [idA, idB],
        leftPartnerId: leftId,
        rightPartnerId: rightId,
        notes: "",
      },
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
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
    return unionId;
  },

  addChild: (unionNodeId) => {
    const state = get();
    const unionNode = state.nodes.find((n) => n.id === unionNodeId && n.type === "union");
    if (!unionNode) return null;

    const nextNum = nextPersonNumber(state.nodes);
    const childId = generateId();
    const newPersonNode: Node<PersonNodeData> = {
      id: childId,
      type: "person",
      position: {
        x: unionNode.position.x,
        y: unionNode.position.y + 160,
      },
      data: { kind: "person", name: `Person ${nextNum}`, notes: "" },
    };

    const childEdge: Edge = {
      id: `e-${unionNodeId}-${childId}`,
      source: unionNodeId,
      target: childId,
      sourceHandle: "children",
      targetHandle: "parent",
      data: { type: "child" },
    };

    const persistUnion = state.persistUnionSelectionOnChildCreate;

    set((s) => ({
      nodes: [...s.nodes, newPersonNode],
      edges: [...s.edges, childEdge],
      selectedNodeIds: persistUnion ? [unionNodeId] : [childId],
      primarySelectedNodeId: persistUnion ? unionNodeId : childId,
      hasUnsavedChanges: true,
      lastSaveError: null,
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
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
  },

  updateNodeNotes: (nodeId, notes) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, notes } } : n
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
  },

  swapUnionPartners: (unionId) => {
    let didSwap = false;
    set((s) => {
      const union = s.nodes.find(
        (n) => n.id === unionId && (n.data as UnionNodeData).kind === "union"
      );
      if (!union) return {};
      const data = union.data as UnionNodeData;
      const leftId = data.leftPartnerId;
      const rightId = data.rightPartnerId;
      if (!leftId || !rightId || !data.partnerIds || data.partnerIds.length !== 2) return {};

      const leftNode = s.nodes.find(
        (n) => n.id === leftId && (n.data as { kind?: string }).kind === "person"
      );
      const rightNode = s.nodes.find(
        (n) => n.id === rightId && (n.data as { kind?: string }).kind === "person"
      );
      if (!leftNode || !rightNode) return {};

      if (import.meta.env.DEV) {
        const dL = leftNode.data as { name?: string; entityId?: string; profileId?: string };
        const dR = rightNode.data as { name?: string; entityId?: string; profileId?: string };
        console.log("[Swap] BEFORE:", {
          leftId,
          leftName: dL.name,
          leftEntityId: dL.entityId,
          leftProfileId: dL.profileId,
          rightId,
          rightName: dR.name,
          rightEntityId: dR.entityId,
          rightProfileId: dR.profileId,
        });
      }

      didSwap = true;
      const snap = (x: number, y: number) =>
        snapPosition(x, y, s.snapToGrid);
      const baseX = Math.min(leftNode.position.x, rightNode.position.x);
      const baseY = leftNode.position.y;

      const newLeftPos = snap(baseX, baseY);
      const newRightPos = snap(baseX + PARTNER_DX, baseY);

      const wLeftNode = s.nodeSizesById[rightId]?.width ?? DEFAULT_PERSON_W;
      const wRightNode = s.nodeSizesById[leftId]?.width ?? DEFAULT_PERSON_W;
      const wU = s.nodeSizesById[unionId]?.width ?? DEFAULT_UNION_W;
      const cL = newLeftPos.x + wLeftNode / 2;
      const cR = newRightPos.x + wRightNode / 2;
      const unionCenterX = (cL + cR) / 2;
      const unionX = unionCenterX - wU / 2;
      const unionY = baseY + UNION_DY;
      const newUnionPos = snap(unionX, unionY);

      const newNodes = s.nodes.map((n) => {
        if (n.id === unionId) {
          return {
            ...n,
            position: newUnionPos,
            data: {
              ...data,
              leftPartnerId: rightId,
              rightPartnerId: leftId,
              partnerIds: [rightId, leftId] as [string, string],
            },
          };
        }
        if (n.id === leftId) {
          return { ...n, position: newRightPos };
        }
        if (n.id === rightId) {
          return { ...n, position: newLeftPos };
        }
        return n;
      });

      if (import.meta.env.DEV && didSwap) {
        const newLeft = newNodes.find((n) => n.id === rightId);
        const newRight = newNodes.find((n) => n.id === leftId);
        const dL = (newLeft?.data ?? {}) as { name?: string; entityId?: string; profileId?: string };
        const dR = (newRight?.data ?? {}) as { name?: string; entityId?: string; profileId?: string };
        console.log("[Swap] AFTER (role swap: leftId=right, rightId=left):", {
          newLeftId: rightId,
          newLeftName: dL.name,
          newLeftEntityId: dL.entityId,
          newLeftProfileId: dL.profileId,
          newRightId: leftId,
          newRightName: dR.name,
          newRightEntityId: dR.entityId,
          newRightProfileId: dR.profileId,
        });
      }

      return { nodes: newNodes, hasUnsavedChanges: true, lastSaveError: null };
    });
    return didSwap;
  },

  loadTree: async (projectId) => {
    const driver = getStorageDriver();
    const payload = await driver.loadProjectData(projectId);
    const nodes = (payload?.nodes ?? []) as Node<FamilyTreeNodeData>[];
    const edges = (payload?.edges ?? []) as Edge[];
    const hadData = payload != null;
    const savedAlignment = payload?.ui?.singleChildAlignment;
    set({
      activeProjectId: projectId,
      nodes,
      edges,
      anchorNodeId: payload?.anchorNodeId ?? null,
      snapToGrid: payload?.ui?.snapToGrid ?? true,
      showNodeInfoEnabled:
        payload?.ui?.showNodeInfoEnabled ??
        payload?.ui?.showCoordinatesEnabled ??
        payload?.ui?.showCoordinates ??
        false,
      nodeInfoTopLeft:
        payload?.ui?.nodeInfoTopLeft ?? payload?.ui?.coordModeTopLeft ?? true,
      nodeInfoCenter:
        payload?.ui?.nodeInfoCenter ?? payload?.ui?.coordModeCenter ?? false,
      nodeInfoSize: payload?.ui?.nodeInfoSize ?? false,
      singleChildAlignment: savedAlignment === "center" || savedAlignment === "right" ? savedAlignment : "left",
      childrenRowAlignment3Plus:
        (payload?.ui?.childrenRowAlignment3Plus === "left" || payload?.ui?.childrenRowAlignment3Plus === "right"
          ? payload.ui.childrenRowAlignment3Plus
          : "center"),
      persistUnionSelectionOnChildCreate: payload?.ui?.persistUnionSelectionOnChildCreate ?? true,
      scriptPanelLayout:
        (payload?.ui?.scriptPanelLayout === "codeOnly" || payload?.ui?.scriptPanelLayout === "viewOnly"
          ? payload.ui.scriptPanelLayout
          : "split"),
      selectedNodeIds: [],
      primarySelectedNodeId: null,
      nodeSizesById: {},
      viewportBounds: null,
      hasUnsavedChanges: false,
      lastSaveError: null,
    });
    return { hadData };
  },

  saveTree: async () => {
    const s = get();
    if (!s.activeProjectId) return false;
    set({ isSaving: true, lastSaveError: null });
    try {
      const driver = getStorageDriver();
      const payload = {
        version: 1 as const,
        moduleType: "familyTree" as const,
        nodes: s.nodes,
        edges: s.edges,
        anchorNodeId: s.anchorNodeId,
        ui: {
          snapToGrid: s.snapToGrid,
          showNodeInfoEnabled: s.showNodeInfoEnabled,
          nodeInfoTopLeft: s.nodeInfoTopLeft,
          nodeInfoCenter: s.nodeInfoCenter,
          nodeInfoSize: s.nodeInfoSize,
          singleChildAlignment: s.singleChildAlignment,
          childrenRowAlignment3Plus: s.childrenRowAlignment3Plus,
          persistUnionSelectionOnChildCreate: s.persistUnionSelectionOnChildCreate,
          scriptPanelLayout: s.scriptPanelLayout,
        },
      };
      await driver.saveProjectData(s.activeProjectId, payload);
      await driver.updateProjectMeta(s.activeProjectId, { updatedAt: Date.now() });
      const now = Date.now();
      set({ hasUnsavedChanges: false, isSaving: false, lastSavedAt: now, lastSaveError: null });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[FamilyTree] Save failed:", e);
      set({ isSaving: false, lastSaveError: msg });
      return false;
    }
  },

  flushSaveAndSave: async () => {
    if (saveDebounce) {
      clearTimeout(saveDebounce);
      saveDebounce = null;
    }
    return get().saveTree();
  },

  clearTree: (projectId) => {
    const pid = projectId ?? get().activeProjectId;
    set({
      nodes: [],
      edges: [],
      selectedNodeIds: [],
      primarySelectedNodeId: null,
      anchorNodeId: null,
      nodeSizesById: {},
      viewportBounds: null,
    });
    if (pid) {
      const driver = getStorageDriver();
      driver.saveProjectData(pid, {
        version: 1,
        moduleType: "familyTree",
        nodes: [],
        edges: [],
        anchorNodeId: null,
        ui: {
          snapToGrid: true,
          showNodeInfoEnabled: false,
          nodeInfoTopLeft: true,
          nodeInfoCenter: false,
          nodeInfoSize: false,
          singleChildAlignment: "left",
          childrenRowAlignment3Plus: "center",
          persistUnionSelectionOnChildCreate: true,
          scriptPanelLayout: "split",
        },
      });
      driver.updateProjectMeta(pid, { updatedAt: Date.now() });
    }
  },
}));

useFamilyTreeStore.subscribe((state) => {
  const nodesOrEdgesChanged =
    state.nodes !== prevNodes || state.edges !== prevEdges;
  const uiPrefsChanged =
    state.showNodeInfoEnabled !== prevShowNodeInfoEnabled ||
    state.nodeInfoTopLeft !== prevNodeInfoTopLeft ||
    state.nodeInfoCenter !== prevNodeInfoCenter ||
    state.nodeInfoSize !== prevNodeInfoSize ||
    state.singleChildAlignment !== prevSingleChildAlignment ||
    state.childrenRowAlignment3Plus !== prevChildrenRowAlignment3Plus ||
    state.persistUnionSelectionOnChildCreate !== prevPersistUnionSelectionOnChildCreate ||
    state.scriptPanelLayout !== prevScriptPanelLayout;
  prevNodes = state.nodes;
  prevEdges = state.edges;
  prevShowNodeInfoEnabled = state.showNodeInfoEnabled;
  prevNodeInfoTopLeft = state.nodeInfoTopLeft;
  prevNodeInfoCenter = state.nodeInfoCenter;
  prevNodeInfoSize = state.nodeInfoSize;
  prevSingleChildAlignment = state.singleChildAlignment;
  prevChildrenRowAlignment3Plus = state.childrenRowAlignment3Plus;
  prevPersistUnionSelectionOnChildCreate = state.persistUnionSelectionOnChildCreate;
  prevScriptPanelLayout = state.scriptPanelLayout;
  if (
    (nodesOrEdgesChanged || uiPrefsChanged) &&
    state.activeProjectId &&
    state.autosaveEnabled
  ) {
    if (saveDebounce) clearTimeout(saveDebounce);
    saveDebounce = setTimeout(() => {
      const s = useFamilyTreeStore.getState();
      if (s.autosaveEnabled && s.activeProjectId) {
        void s.saveTree();
      }
      saveDebounce = null;
    }, SAVE_DEBOUNCE_MS);
  }
});
