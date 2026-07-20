import { create } from "zustand";
import type { Node, Edge } from "reactflow";
import { getStorageDriver } from "../storage/StorageDriver";

/** Grid size for Family Tree canvas. Must match snapGrid in FamilyTreeCanvas. */
export const FAMILY_TREE_GRID_SIZE = 16;

/** Y offset from anchor top for Sort baseline when snapping gen-assigned nodes. */
export const GEN_BASELINE_OFFSET = 64;

/** Sort v1 layout constants. */
export const PARTNER_DX = 224;
export const UNION_DY = 96;
export const CHILD_DY = 208;
/** Child row: gap shrinks with more children (max 224, min 8). */
export const CHILD_MAX_GAP = 224;
export const CHILD_MIN_GAP = 8;
/** Uniform horizontal step for same-generation siblings (e.g. 0, 224, 448, 672). */
const UNIFORM_SPACING = 224;

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

/** Generation anchor: defines a horizontal band for organizing persons by generation. */
export interface GenerationAnchor {
  id: string;
  index: number;
  yTop: number;
  height: number;
  customLabel?: string;
}

export interface PersonNodeData {
  kind: "person";
  name: string; // Derived from firstName+middleName+lastName when present; used for script/display fallback
  notes: string;
  /** First, middle, last name; when set, name is derived from these. Legacy nodes have only name. */
  firstName?: string;
  middleName?: string;
  lastName?: string;
  genAnchorId?: string | null;
  /** True after user has clicked or dragged the node; required for gen inheritance. */
  isGenArmed?: boolean;
  /** Comma-separated nicknames; stored as array. */
  nicknames?: string[];
  /** Union IDs in left-to-right order for multi-union connection handles. Swapped via Swap Sides. */
  partnerUnionOrder?: string[];
}

/** True if a name part is "filled" (non-empty and not unknown placeholder like ? or ???). */
function isFilledNamePart(s: string | undefined | null): boolean {
  const t = (s ?? "").trim();
  return !!t && !isUnknownPlaceholder(t);
}

/**
 * Display name with first/middle fallback and Unknown N for unnamed persons.
 * - Prefer first if filled; else middle if filled; ignore ? in other fields.
 * - When last is filled, combine with chosen field (e.g. "John" + "Doe" → "John Doe").
 * - If first is ? and middle/last empty or ?, use "Unknown N" (persisted or derived from nodes).
 * @param nodeId - optional, for deriving unique Unknown N when nodes provided
 * @param nodes - optional, for deriving stable Unknown N across tree
 */
/** Minimal node shape for display-name resolution; full Node not required. */
type NodeLike = { id: string; data?: unknown };

export function getPersonDisplayName(
  data: PersonNodeData,
  _nodeId?: string,
  _nodes?: NodeLike[]
): string {
  const f = (data.firstName ?? "").trim();
  const m = (data.middleName ?? "").trim();
  const l = (data.lastName ?? "").trim();

  const filled = isFilledNamePart;

  // First/middle fallback: prefer first if filled, else middle
  const primary = filled(f) ? f : filled(m) ? m : null;

  if (primary !== null) {
    return filled(l) ? `${primary} ${l}` : primary;
  }

  // All parts unknown: derive "Unknown N" from nodes if available, else show "?"
  if (_nodeId && _nodes?.length) {
    const personNodes = _nodes
      .filter((n): n is NodeLike & { data: PersonNodeData } => (n.data as PersonNodeData)?.kind === "person")
      .sort((a, b) => a.id.localeCompare(b.id));
    const allUnknown = (d: PersonNodeData) => {
      const x = (s: string | undefined) => !(s ?? "").trim() || /^\?+$/.test((s ?? "").trim());
      return x(d.firstName) && x(d.middleName) && x(d.lastName);
    };
    let idx = 0;
    for (const n of personNodes) {
      if (allUnknown(n.data as PersonNodeData)) {
        if (n.id === _nodeId) return `Unknown ${idx + 1}`;
        idx++;
      }
    }
  }
  if (filled(data.name)) return data.name;
  if (filled(data.firstName)) return data.firstName!;
  if (filled(data.middleName)) return data.middleName!;
  if (filled(data.lastName)) return data.lastName!;
  return "?";
}

/** Parse full name into first, middle, last. First token = first, last token = last (if >1), middle = tokens between. */
export function parseFullName(fullName: string): { first: string; middle: string; last: string } {
  const tokens = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first: "", middle: "", last: "" };
  if (tokens.length === 1) return { first: tokens[0]!, middle: "", last: "" };
  return {
    first: tokens[0]!,
    middle: tokens.slice(1, -1).join(" "),
    last: tokens[tokens.length - 1]!,
  };
}

/** Get display parts from PersonNodeData: use stored parts if present, else parse full name. */
export function getPersonNameParts(data: PersonNodeData): { first: string; middle: string; last: string } {
  const f = (data.firstName ?? "").trim();
  const m = (data.middleName ?? "").trim();
  const l = (data.lastName ?? "").trim();
  if (f || m || l) return { first: f, middle: m, last: l };
  return parseFullName(data.name ?? "");
}

/** Escape a name part for declaration: wrap in double quotes if it contains comma or quote. */
function escapeDeclarationPart(s: string): string {
  if (s.includes(",") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Format person name for declaration: [first, middle, last]. Empty parts stay empty; commas in values get quoted. */
export function formatPersonDeclarationBracket(data: PersonNodeData): string {
  const { first, middle, last } = getPersonNameParts(data);
  const a = escapeDeclarationPart(first);
  const b = escapeDeclarationPart(middle);
  const c = escapeDeclarationPart(last);
  return `[${a}, ${b}, ${c}]`;
}

/** Format nickname metadata: ` nickname: a, b, c`. Values with commas are quoted. */
function formatNicknameTag(nicknames: string[] | undefined): string {
  if (!nicknames?.length) return "";
  const parts = nicknames.map((n) => escapeDeclarationPart(n.trim())).filter(Boolean);
  if (parts.length === 0) return "";
  return ` nickname: ${parts.join(", ")}`;
}

/** "forward" = parents above, children below (current). "backward" = children first, add parents above. */
export type UnionType = "forward" | "backward";

/** Parent role in a union; at most one father and one mother per union. */
export type ParentRole = "father" | "mother";

export interface ConnectionVisualStyle {
  stroke: string;
  strokeWidth: number;
  dashPattern: number[];
  description?: string;
}

export interface ConnectionStyleDef extends ConnectionVisualStyle {
  id: string;
  name: string;
}

export const DEFAULT_CONNECTION_STYLE: ConnectionVisualStyle = {
  stroke: "#64748b",
  strokeWidth: 1.5,
  dashPattern: [],
};

export function resolveUnionConnectionStyle(
  data: Pick<UnionNodeData, "connectionStyleId" | "connectionStyleOverride">,
  connectionStyles: ConnectionStyleDef[]
): ConnectionVisualStyle {
  if (data.connectionStyleOverride) return data.connectionStyleOverride;
  if (data.connectionStyleId) {
    const found = connectionStyles.find((s) => s.id === data.connectionStyleId);
    if (found) return found;
  }
  return DEFAULT_CONNECTION_STYLE;
}

export interface UnionNodeData {
  kind: "union";
  partnerIds: [string | null, string | null]; // Parent IDs; null = slot not yet filled (backward union in progress)
  leftPartnerId?: string;
  rightPartnerId?: string;
  /** Role of left partner; at most one father and one mother per union. */
  leftPartnerRole?: ParentRole;
  /** Role of right partner; at most one father and one mother per union. */
  rightPartnerRole?: ParentRole;
  /** When true, swap which handle each partner connects to (left↔right) to reduce edge crossings. */
  partnerHandleSwap?: boolean;
  notes: string;
  unionType?: UnionType; // Default "forward" for legacy
  connectionStyleId?: string;
  connectionStyleOverride?: ConnectionVisualStyle;
}

export type FamilyTreeNodeData = PersonNodeData | UnionNodeData;

export interface FamilyTreeSavedState {
  nodes: Node<FamilyTreeNodeData>[];
  edges: Edge[];
  anchorNodeId: string | null;
  generationAnchors?: GenerationAnchor[];
  connectionStyles?: ConnectionStyleDef[];
  uiFlags?: { snapToGrid?: boolean; showCoordinates?: boolean };
  ui?: {
    genLabelMode?: "letters" | "numbers" | "both";
    showCoordinatesEnabled?: boolean;
    showNodeInfoEnabled?: boolean;
    singleChildAlignment?: "left" | "center" | "right";
    childrenRowAlignment3Plus?: "left" | "center" | "right";
    coordModeTopLeft?: boolean;
    coordModeCenter?: boolean;
    nodeInfoTopLeft?: boolean;
    nodeInfoCenter?: boolean;
    nodeInfoSize?: boolean;
    nodeInfoSpacing?: boolean;
    scriptPanelLayout?: "split" | "codeOnly" | "viewOnly";
    showGenerationAnchors?: boolean;
    showGenInheritIndicator?: boolean;
  };
}

function isPersonData(data: FamilyTreeNodeData): data is PersonNodeData {
  return (data as PersonNodeData).kind === "person";
}

/** True if string is "???" or similar unknown placeholder (only ? chars, optionally trimmed). */
function isUnknownPlaceholder(s: string | undefined | null): boolean {
  const t = (s ?? "").trim();
  return !t || /^\?+$/.test(t);
}

/** Max N from "Unknown N" in person nodes, or 0 if none. */
function getMaxUnknownNumber(nodes: Node<FamilyTreeNodeData>[]): number {
  let max = 0;
  for (const n of nodes) {
    if (n.data?.kind !== "person") continue;
    const d = n.data as PersonNodeData;
    const check = (val: string | undefined) => {
      const m = val?.match(/^Unknown (\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1]!, 10));
    };
    check(d.name);
    check(d.firstName);
    check(d.middleName);
    check(d.lastName);
    d.nicknames?.forEach(check);
  }
  return max;
}

/** Replace ??? in person node fields. When all three name fields (first, middle, last) are ?, use "Unknown N" in first only. */
function normalizeUnknownNames(nodes: Node<FamilyTreeNodeData>[]): Node<FamilyTreeNodeData>[] {
  const isUnknownOrUnknownN = (s: string | undefined | null) =>
    isUnknownPlaceholder(s) || /^Unknown \d+$/.test((s ?? "").trim());
  const personNodes = nodes
    .filter((n): n is Node<PersonNodeData> => n.data?.kind === "person")
    .sort((a, b) => a.id.localeCompare(b.id));
  let nextNum = 1;
  const allUnknownByNodeId = new Map<string, string>();
  for (const n of personNodes) {
    const d = n.data;
    const f = (d.firstName ?? "").trim();
    const m = (d.middleName ?? "").trim();
    const l = (d.lastName ?? "").trim();
    const allThreeUnknown = isUnknownOrUnknownN(f) && isUnknownOrUnknownN(m) && isUnknownOrUnknownN(l);
    if (allThreeUnknown) {
      allUnknownByNodeId.set(n.id, `Unknown ${nextNum}`);
      nextNum++;
    }
  }
  const result = nodes.map((n) => {
    if (n.data?.kind !== "person") return n;
    const d = n.data as PersonNodeData;
    const repl = allUnknownByNodeId.get(n.id);
    if (repl) {
      return {
        ...n,
        data: {
          ...d,
          name: repl,
          firstName: repl,
          middleName: "",
          lastName: "",
        },
      };
    }
    const hasRepl = isUnknownOrUnknownN(d.name) || isUnknownOrUnknownN(d.firstName) ||
      isUnknownOrUnknownN(d.middleName) || isUnknownOrUnknownN(d.lastName) ||
      (d.nicknames ?? []).some((v) => isUnknownOrUnknownN(v));
    if (!hasRepl) return n;
    const newData: PersonNodeData = {
      ...d,
      name: isUnknownOrUnknownN(d.name) ? "?" : d.name,
      firstName: isUnknownOrUnknownN(d.firstName) ? "?" : d.firstName,
      middleName: isUnknownOrUnknownN(d.middleName) ? "?" : d.middleName,
      lastName: isUnknownOrUnknownN(d.lastName) ? "?" : d.lastName,
      nicknames: d.nicknames?.map((v) => (isUnknownOrUnknownN(v) ? "?" : v)),
    };
    return { ...n, data: newData };
  });
  return result.some((n, i) => n !== nodes[i]) ? result : nodes;
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
        if (pid != null && personIds.has(pid) && !parentsOf[childId].includes(pid)) {
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

/** Format generation anchor label for display (letters/numbers/both). */
export function formatGenerationAnchorLabel(
  anchor: GenerationAnchor,
  mode: "letters" | "numbers" | "both"
): string {
  const letter = anchor.index < 26 ? String.fromCharCode(65 + anchor.index) : `Gen ${anchor.index + 1}`;
  const num = String(anchor.index);
  if (mode === "letters") return letter;
  if (mode === "numbers") return num;
  return `${letter} (${num})`;
}

/** Format generation number as "Gen A", "Gen B", etc. Unknown => "Gen —" */
export function formatGeneration(gen: number | undefined): string {
  if (gen === undefined || gen < 0) return "Gen —";
  if (gen < 26) return `Gen ${String.fromCharCode(65 + gen)}`;
  return `Gen ${gen + 1}`;
}

/** Return the anchor that contains flow-space Y, or null. Uses centerY = node top + height/2. */
export function getAnchorAtY(
  anchors: GenerationAnchor[],
  y: number
): GenerationAnchor | null {
  const sorted = [...anchors].sort((a, b) => a.index - b.index);
  for (const a of sorted) {
    if (y >= a.yTop && y <= a.yTop + a.height) return a;
  }
  return null;
}

/** Child edges use edge.data.type === 'child' (see addChild). */
export function isChildEdge(edge: Edge): boolean {
  return (edge.data as { type?: string })?.type === "child";
}

/** Direct partner ids + direct child ids of a union, NOT including the union itself or further descendants. */
export function getUnionFamilyMemberIds(
  unionId: string,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): string[] {
  const unionNode = nodes.find(
    (n) => n.id === unionId && n.type === "union" && (n.data as UnionNodeData).kind === "union"
  );
  if (!unionNode) return [];
  const data = unionNode.data as UnionNodeData;
  const partnerIds = [data.leftPartnerId, data.rightPartnerId, ...(data.partnerIds ?? [])].filter(
    (id): id is string => id != null
  );
  const childIds = edges.filter((e) => e.source === unionId && isChildEdge(e)).map((e) => e.target);
  return Array.from(new Set([...partnerIds, ...childIds]));
}

/** True if person is target of any child edge (i.e. has parents / is already a child). */
export function hasParents(edges: Edge[], personId: string): boolean {
  return edges.some((e) => isChildEdge(e) && e.target === personId);
}

/** Partner edges use edge.data.type === 'partner'. */
function isPartnerEdge(edge: Edge): boolean {
  return (edge.data as { type?: string })?.type === "partner";
}

/** Union IDs this person belongs to (as partner or child). Used for orphan check before remove-from-union. */
export function getUnionIdsForPerson(personId: string, edges: Edge[]): Set<string> {
  const ids = new Set<string>();
  for (const e of edges) {
    if (isPartnerEdge(e) && e.source === personId) ids.add(e.target);
    if (isChildEdge(e) && e.target === personId) ids.add(e.source);
  }
  return ids;
}

/** Suggestion from the name/role analysis engine. Exposed for consent UI. */
export interface NameRoleSuggestion {
  nodeId: string;
  field: "firstName" | "role";
  currentValue: string;
  proposedValue: string;
  reason: string;
  /** For role suggestions: which union and slot to update. */
  unionId?: string;
  slot?: "left" | "right";
}

/**
 * Analyze person nodes for name and role improvements.
 * Produces suggestions only—no auto-apply.
 * - Mr./Mrs.: When last name filled but first empty or "?", suggest "Mr." or "Mrs." if role known.
 * - Role inference: If children share parent's last name, propose Father.
 * - No inference: Suggest manual Father/Mother selection when role cannot be inferred.
 */
export function analyzeNameAndRoleSuggestions(
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): NameRoleSuggestion[] {
  const suggestions: NameRoleSuggestion[] = [];
  const personById = new Map(
    nodes
      .filter((n): n is Node<PersonNodeData> => n.data?.kind === "person")
      .map((n) => [n.id, n])
  );
  const unionNodes = nodes.filter(
    (n): n is Node<UnionNodeData> =>
      n.type === "union" && (n.data as UnionNodeData).kind === "union"
  );

  const getPersonLastName = (personId: string): string =>
    (getPersonNameParts((personById.get(personId)?.data as PersonNodeData) ?? { kind: "person", name: "", notes: "" }).last ?? "").trim();

  /** Get person's role from any union they're in. Father/Mother or null if unknown. */
  const getPersonRole = (personId: string): ParentRole | null => {
    for (const u of unionNodes) {
      const d = u.data as UnionNodeData;
      const leftId = d.leftPartnerId ?? d.partnerIds?.[0];
      const rightId = d.rightPartnerId ?? d.partnerIds?.[1];
      if (leftId === personId && d.leftPartnerRole) return d.leftPartnerRole;
      if (rightId === personId && d.rightPartnerRole) return d.rightPartnerRole;
    }
    return null;
  };

  /** Get union and slot where this person is a parent without a role. */
  const getUnionSlotWithoutRole = (
    personId: string
  ): { unionId: string; slot: "left" | "right" }[] => {
    const out: { unionId: string; slot: "left" | "right" }[] = [];
    for (const u of unionNodes) {
      const d = u.data as UnionNodeData;
      const leftId = d.leftPartnerId ?? d.partnerIds?.[0];
      const rightId = d.rightPartnerId ?? d.partnerIds?.[1];
      if (leftId === personId && !d.leftPartnerRole) out.push({ unionId: u.id, slot: "left" });
      if (rightId === personId && !d.rightPartnerRole) out.push({ unionId: u.id, slot: "right" });
    }
    return out;
  };

  const getChildIds = (unionId: string): string[] =>
    edges
      .filter((e) => e.source === unionId && isChildEdge(e))
      .map((e) => e.target)
      .filter((id) => personById.has(id));

  /** Get other partner's role and id in a union, given one slot. */
  const getOtherPartnerInUnion = (
    unionNode: Node<UnionNodeData>,
    slot: "left" | "right"
  ): { otherId: string | null; otherRole: ParentRole | null } => {
    const d = unionNode.data as UnionNodeData;
    const leftId = d.leftPartnerId ?? d.partnerIds?.[0];
    const rightId = d.rightPartnerId ?? d.partnerIds?.[1];
    if (slot === "left") return { otherId: rightId ?? null, otherRole: d.rightPartnerRole ?? null };
    return { otherId: leftId ?? null, otherRole: d.leftPartnerRole ?? null };
  };

  const getPersonDisplayNameShort = (personId: string): string =>
    getPersonDisplayName(
      (personById.get(personId)?.data as PersonNodeData) ?? { kind: "person", name: "", notes: "" },
      personId,
      nodes
    );

  for (const n of personById.values()) {
    const d = n.data as PersonNodeData;
    const firstName = (d.firstName ?? "").trim();
    const lastName = (d.lastName ?? "").trim();
    const lastNameFilled = !!lastName && !isUnknownPlaceholder(lastName);
    const firstNameEmptyOrUnknown = !firstName || isUnknownPlaceholder(firstName);

    // Mr./Mrs. suggestion: last name filled, first name empty or ?
    if (lastNameFilled && firstNameEmptyOrUnknown) {
      const role = getPersonRole(n.id);
      if (role === "father") {
        suggestions.push({
          nodeId: n.id,
          field: "firstName",
          currentValue: firstName || "(empty)",
          proposedValue: "Mr.",
          reason: "Father → Mr.",
        });
      } else if (role === "mother") {
        suggestions.push({
          nodeId: n.id,
          field: "firstName",
          currentValue: firstName || "(empty)",
          proposedValue: "Mrs.",
          reason: "Mother → Mrs.",
        });
      } else {
        suggestions.push({
          nodeId: n.id,
          field: "firstName",
          currentValue: firstName || "(empty)",
          proposedValue: "Mr./Mrs.",
          reason: "Select Father or Mother role first to pick Mr. or Mrs.",
        });
      }
    }

    // Role inference: parents without role
    const slotsWithoutRole = getUnionSlotWithoutRole(n.id);
    for (const { unionId, slot } of slotsWithoutRole) {
      const unionNode = unionNodes.find((u) => u.id === unionId);
      if (!unionNode) continue;
      const { otherId, otherRole } = getOtherPartnerInUnion(unionNode, slot);
      // Partner inference: if other parent has role, suggest opposite
      if (otherRole && otherId) {
        const inferredRole: ParentRole = otherRole === "father" ? "mother" : "father";
        const partnerName = getPersonDisplayNameShort(otherId);
        suggestions.push({
          nodeId: n.id,
          field: "role",
          currentValue: "",
          proposedValue: inferredRole,
          reason: `Set ${getPersonDisplayNameShort(n.id)} as ${inferredRole === "father" ? "Father" : "Mother"} – partner (${partnerName}) is ${otherRole === "father" ? "Father" : "Mother"}`,
          unionId,
          slot,
        });
        continue;
      }
      // Fallback: children share last name or manual selection
      const childIds = getChildIds(unionId);
      const parentLastName = getPersonLastName(n.id);
      const childrenShareLastName =
        parentLastName &&
        childIds.some((cid) => {
          const childLast = getPersonLastName(cid);
          return childLast && childLast.toLowerCase() === parentLastName.toLowerCase();
        });

      if (childrenShareLastName) {
        suggestions.push({
          nodeId: n.id,
          field: "role",
          currentValue: "",
          proposedValue: "father",
          reason: "Children share last name",
          unionId,
          slot,
        });
      } else {
        suggestions.push({
          nodeId: n.id,
          field: "role",
          currentValue: "",
          proposedValue: "father/mother",
          reason: "Select Father or Mother",
          unionId,
          slot,
        });
      }
    }
  }

  return suggestions;
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
    generationAnchors?: GenerationAnchor[];
    genLabelMode?: "letters" | "numbers" | "both";
    connectionStyles?: ConnectionStyleDef[];
  }
): string {
  const compactDeclarations = options?.compactDeclarations ?? false;
  const showNodeInfo = options?.showNodeInfo ?? false;
  const nodeInfoTopLeft = options?.nodeInfoTopLeft ?? true;
  const nodeInfoCenter = options?.nodeInfoCenter ?? false;
  const nodeInfoSize = options?.nodeInfoSize ?? false;
  const nodeSizesById = options?.nodeSizesById ?? {};
  const generationAnchors = options?.generationAnchors ?? [];
  const genLabelMode = options?.genLabelMode ?? "letters";
  const connectionStyles = options?.connectionStyles ?? [];

  const anchorById = new Map(generationAnchors.map((a) => [a.id, a]));
  const hasAnchors = generationAnchors.length > 0;
  /** Anchor index (0-based) for person declarations when anchors exist. Uses genAnchorId or infers from Y. */
  const getGenIndexForPerson = (n: Node<PersonNodeData>): number | null => {
    if (!hasAnchors) return null;
    const genAnchorId = n.data.genAnchorId;
    if (genAnchorId) {
      const anchor = anchorById.get(genAnchorId);
      return anchor ? anchor.index : null;
    }
    const { h } = getSize(n.id, false);
    const centerY = n.position.y + h / 2;
    const anchor = getAnchorAtY(generationAnchors, centerY);
    return anchor ? anchor.index : null;
  };
  /** Gen tag for declaration metadata: ` gen: N` when anchors exist and person has/infers a generation. */
  const getGenTagForPerson = (n: Node<PersonNodeData>): string => {
    const idx = getGenIndexForPerson(n);
    return idx !== null ? ` gen: ${idx}` : "";
  };
  const getGenSuffix = (n: Node<PersonNodeData>): string => {
    const genAnchorId = n.data.genAnchorId;
    if (!genAnchorId) return "";
    const anchor = anchorById.get(genAnchorId);
    if (!anchor) return "";
    const label = formatGenerationAnchorLabel(anchor, genLabelMode);
    return ` {Gen ${label}}`;
  };
  const getGenLabel = (personNode: Node<PersonNodeData>): string | null => {
    const genAnchorId = personNode.data.genAnchorId;
    if (!genAnchorId) return null;
    const anchor = anchorById.get(genAnchorId);
    if (!anchor) return null;
    return formatGenerationAnchorLabel(anchor, genLabelMode);
  };

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
  const getName = (id: string) => {
    const n = personById.get(id);
    if (!n) return id;
    const d = n.data as PersonNodeData;
    return getPersonDisplayName(d, n.id, nodes) || id;
  };

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
        const bracket = formatPersonDeclarationBracket(n.data);
        const base = `${bracket}(${n.id})${formatNicknameTag(n.data.nicknames)}${getGenTagForPerson(n)}`;
        return base + getInlineInfo(n, n.id, false);
      });
      const unionTokens = unionNodes.map((u) => {
        const base = `Union ${u.id}`;
        return base + getInlineInfo(u, u.id, true);
      });
      lines.push([...tokens, ...unionTokens].join(", "));
    } else {
      const tokens = personNodes.map((n) => {
        const bracket = formatPersonDeclarationBracket(n.data);
        return `${bracket}(${n.id})${formatNicknameTag(n.data.nicknames)}${getGenTagForPerson(n)}`;
      });
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
      const bracket = formatPersonDeclarationBracket(n.data);
      lines.push(`${bracket} (${n.id})${formatNicknameTag(n.data.nicknames)}${getGenTagForPerson(n)}`);
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
      const bracket = formatPersonDeclarationBracket(n.data);
      lines.push(`${bracket} # id: ${n.id}${formatNicknameTag(n.data.nicknames)}${getGenTagForPerson(n)}`);
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

    const childTokens = childNodes.map(
      (n) => `-> ${getName(n.id)}${getGenSuffix(n)}`
    );

    const isRootUnion =
      !hasParents(edges, leftId) && !hasParents(edges, rightId);
    let rootGenTag = "";
    if (isRootUnion) {
      const leftNode = personById.get(leftId);
      const rightNode = personById.get(rightId);
      const gL = leftNode ? getGenLabel(leftNode) : null;
      const gR = rightNode ? getGenLabel(rightNode) : null;
      if (gL && gR) {
        rootGenTag = gL === gR ? ` {Gen ${gL}}` : ` {Gen ${gL} / Gen ${gR}}`;
      } else if (gL) {
        rootGenTag = ` {Gen ${gL} / ?}`;
      } else if (gR) {
        rootGenTag = ` {Gen ? / Gen ${gR}}`;
      }
    }

    const leftRole = data.leftPartnerRole;
    const rightRole = data.rightPartnerRole;
    const leftPart = `${leftName}${leftRole ? ` (${leftRole})` : ""}`;
    const rightPart = `${rightName}${rightRole ? ` (${rightRole})` : ""}`;
    const libraryStyle = data.connectionStyleId
      ? connectionStyles.find((s) => s.id === data.connectionStyleId)
      : undefined;
    const styleTag = libraryStyle ? ` [style: ${libraryStyle.id} "${libraryStyle.name}"]` : "";
    const headerLine = `@${union.id}: ${leftPart} <=> ${rightPart}${rootGenTag}${styleTag}`;
    if (childTokens.length > 0) {
      lines.push(`${headerLine} {`);
      lines.push(`  children: ${childTokens.join(", ")}`);
      lines.push("}");
    } else {
      lines.push(headerLine);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Parse comma-separated values inside brackets, respecting double-quoted segments. */
function parseBracketParts(inner: string): [string, string, string] | null {
  const parts: string[] = [];
  let i = 0;
  let current = "";
  let inQuotes = false;
  while (i < inner.length) {
    const c = inner[i];
    if (inQuotes) {
      if (c === '"' && inner[i + 1] === '"') {
        current += '"';
        i += 2;
      } else if (c === '"') {
        inQuotes = false;
        i++;
      } else {
        current += c;
        i++;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
      } else if (c === ",") {
        parts.push(current.trim());
        current = "";
        i++;
        while (i < inner.length && inner[i] === " ") i++;
      } else {
        current += c;
        i++;
      }
    }
  }
  parts.push(current.trim());
  if (parts.length !== 3) return null;
  return [parts[0]!, parts[1]!, parts[2]!];
}

/**
 * Parse person declaration bracket [first, middle, last] or legacy [Full Name].
 * Returns { first, middle, last } for new format, or parseFullName result for legacy.
 */
export function parsePersonDeclarationBracket(line: string): { first: string; middle: string; last: string } | null {
  const bracketMatch = line.match(/^\s*\[([^\]]*)\]\s*/);
  if (!bracketMatch) return null;
  const inner = bracketMatch[1]!;
  const parts = parseBracketParts(inner);
  if (parts) return { first: parts[0], middle: parts[1], last: parts[2] };
  const legacy = inner.trim();
  return legacy ? parseFullName(legacy) : { first: "", middle: "", last: "" };
}

function parseCommaSeparatedWithQuotes(s: string): string[] {
  const result: string[] = [];
  let i = 0;
  let current = "";
  let inQuotes = false;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"' && s[i + 1] === '"') {
        current += '"';
        i += 2;
      } else if (c === '"') {
        inQuotes = false;
        i++;
      } else {
        current += c;
        i++;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
      } else if (c === ",") {
        result.push(current.trim());
        current = "";
        i++;
        while (i < s.length && s[i] === " ") i++;
      } else {
        current += c;
        i++;
      }
    }
  }
  result.push(current.trim());
  return result.filter(Boolean);
}

/**
 * Parse person declaration metadata from a script line.
 * Supports formats:
 *   [First, Middle, Last] # id: _abc123 nickname: a, b gen: 0
 *   [Full Name] # id: _abc123  (legacy)
 *   [First, Middle, Last](id) nickname: a, b gen: 0  (compact)
 * @returns Parsed result or null if no declaration found.
 */
export function parsePersonDeclarationMetadata(
  line: string,
  generationAnchors: GenerationAnchor[] = []
): {
  id: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  nicknames?: string[];
  genAnchorId?: string;
} | null {
  const bracket = parsePersonDeclarationBracket(line);
  if (!bracket) return null;

  const metaMatch = line.match(/#\s*id:\s*([^\s#]+)(?:\s+nickname:\s*([^#]+?))?(?=\s+gen:\s|\s*$)?(?:\s+gen:\s*(\d+))?/);
  if (!metaMatch) {
    const compactMatch = line.match(/\]\s*\(([^)]+)\)\s*(?:\s+nickname:\s*([^#]+?))?(?=\s+gen:\s|\s*$)?(?:\s+gen:\s*(\d+))?/);
    if (!compactMatch) return null;
    const id = compactMatch[1]!.trim();
    const nicknameStr = compactMatch[2]?.trim();
    const genStr = compactMatch[3];
    const nicknames = nicknameStr ? parseCommaSeparatedWithQuotes(nicknameStr) : undefined;
    let genAnchorId: string | undefined;
    if (genStr !== undefined && generationAnchors.length > 0) {
      const genIndex = parseInt(genStr, 10);
      const sorted = [...generationAnchors].sort((a, b) => a.index - b.index);
      const anchor = sorted[genIndex];
      genAnchorId = anchor?.id;
    }
    return {
      id,
      firstName: bracket.first || undefined,
      middleName: bracket.middle || undefined,
      lastName: bracket.last || undefined,
      nicknames,
      genAnchorId,
    };
  }
  const id = metaMatch[1]!.trim();
  const nicknameStr = metaMatch[2]?.trim();
  const genStr = metaMatch[3];
  const nicknames = nicknameStr ? parseCommaSeparatedWithQuotes(nicknameStr) : undefined;
  let genAnchorId: string | undefined;
  if (genStr !== undefined && generationAnchors.length > 0) {
    const genIndex = parseInt(genStr, 10);
    const sorted = [...generationAnchors].sort((a, b) => a.index - b.index);
    const anchor = sorted[genIndex];
    genAnchorId = anchor?.id;
  }
  return {
    id,
    firstName: bracket.first || undefined,
    middleName: bracket.middle || undefined,
    lastName: bracket.last || undefined,
    nicknames,
    genAnchorId,
  };
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
  nodeInfoSpacing: boolean;
  singleChildAlignment: "left" | "center" | "right";
  childrenRowAlignment3Plus: "left" | "center" | "right";
  persistUnionSelectionOnChildCreate: boolean;
  scriptPanelLayout: "split" | "codeOnly" | "viewOnly";
  scriptCompactDeclarations: boolean;
  showGenerationAnchors: boolean;
  showGenInheritIndicator: boolean;
  generationAnchors: GenerationAnchor[];
  connectionStyles: ConnectionStyleDef[];
  /** Anchor ids in edit mode (draggable, capture input). Confirmed anchors pass input through. */
  editingAnchorIds: string[];
  genLabelMode: "letters" | "numbers" | "both";
  genInheritFlashByNodeId: Record<string, { token: number; label: string }>;
  pendingGenChangePrompt: {
    nodeId: string;
    nodeName: string;
    fromAnchorId: string;
    toAnchorId: string;
    fromLabel: string;
    toLabel: string;
    previousPosition: { x: number; y: number };
  } | null;
  marqueeToolActive: boolean;
  isSpacePanning: boolean;
  exportGuidesVisible: boolean;
  showLegend: boolean;
  exportGuideScale: number;
  showExportDialog: boolean;
  exportOptions: {
    layoutMode: "currentView" | "cleanLayout";
    includeNotes: boolean;
    includeLegend: boolean;
    showGenerationBands: boolean;
  };
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
  setNodeInfoSpacing: (v: boolean) => void;
  setPersistUnionSelectionOnChildCreate: (v: boolean) => void;
  setScriptPanelLayout: (v: "split" | "codeOnly" | "viewOnly") => void;
  setScriptCompactDeclarations: (v: boolean) => void;
  setShowGenerationAnchors: (v: boolean) => void;
  setShowGenInheritIndicator: (v: boolean) => void;
  addGenerationAnchor: () => void;
  enterAnchorEditMode: (anchorId: string) => void;
  confirmAnchor: (anchorId: string) => void;
  removeGenerationAnchor: (anchorId: string) => void;
  updateGenerationAnchorLabel: (anchorId: string, customLabel: string) => void;
  updateGenerationAnchorBounds: (anchorId: string, updates: { yTop?: number; height?: number }) => void;
  addConnectionStyle: (style: Omit<ConnectionStyleDef, "id">) => string;
  updateConnectionStyle: (id: string, patch: Partial<Omit<ConnectionStyleDef, "id">>) => void;
  deleteConnectionStyle: (id: string) => void;
  duplicateConnectionStyle: (id: string) => string | null;
  setUnionConnectionStyleId: (unionId: string, styleId: string | undefined) => void;
  setUnionConnectionStyleOverride: (unionId: string, style: ConnectionVisualStyle | undefined) => void;
  setGenLabelMode: (v: "letters" | "numbers" | "both") => void;
  setNodeGenArmed: (nodeId: string) => void;
  updateNodeGenAnchor: (nodeId: string, genAnchorId: string | null) => void;
  setGenInheritFlash: (nodeId: string, label: string) => void;
  clearGenInheritFlash: (nodeId: string) => void;
  setPendingGenChangePrompt: (p: FamilyTreeStore["pendingGenChangePrompt"]) => void;
  resolveGenChangePrompt: (choice: "update" | "cancel") => void;
  setMarqueeToolActive: (v: boolean) => void;
  setIsSpacePanning: (v: boolean) => void;
  setExportGuidesVisible: (v: boolean) => void;
  setShowLegend: (v: boolean) => void;
  setExportGuideScale: (v: number) => void;
  setShowExportDialog: (v: boolean) => void;
  setExportOptions: (opts: Partial<FamilyTreeStore["exportOptions"]>) => void;
  setAutosaveEnabled: (v: boolean) => void;
  addPerson: (options?: { genAnchorId?: string }) => string;
  createUnion: (partnerNodeIds: [string, string]) => string | null;
  createBackwardUnion: (childNodeIds: [string] | [string, string]) => string | null;
  addChild: (unionNodeId: string) => string | null;
  addParent: (unionNodeId: string) => string | null;
  /** Link existing person to union. Forward = add as parent, Backward = add as child. Returns error message on failure. */
  linkPersonToUnion: (unionId: string, personId: string, mode: UnionType) => string | null;
  defaultUnionType: UnionType;
  setDefaultUnionType: (t: UnionType) => void;
  updateNodeName: (nodeId: string, name: string) => void;
  updatePersonNameParts: (nodeId: string, parts: { firstName: string; middleName: string; lastName: string }) => void;
  updatePersonNicknames: (nodeId: string, nicknames: string[]) => void;
  updateNodeNotes: (nodeId: string, notes: string) => void;
  updateUnionPartnerRole: (unionId: string, slot: "left" | "right", role: ParentRole | null) => void;
  swapUnionPartners: (unionId: string) => boolean;
  /** Swap which union handle each partner's edge uses (reduces crossings). Does not change partner roles. */
  swapUnionHandleSides: (unionId: string) => boolean;
  /** Swap connection sides for a person with 2+ unions. Reverses partnerUnionOrder. */
  swapPersonUnionSides: (personId: string) => boolean;
  /** Move a child from one union to another. Returns false if union/child not found or child not in source union. */
  moveChildToUnion: (childId: string, fromUnionId: string, toUnionId: string) => boolean;
  /** Remove a partner from a union. Returns error message or null. Cannot remove last parent. */
  removePartnerFromUnion: (unionId: string, personId: string) => string | null;
  /** Remove a child from a union. Returns error message or null. */
  removeChildFromUnion: (unionId: string, childId: string) => string | null;
  /** Analysis suggestions for name/role improvements. Updated on load and when runNameRoleAnalysis is called. */
  nameRoleSuggestions: NameRoleSuggestion[];
  /** Run name/role analysis; stores result in nameRoleSuggestions for consent UI. */
  runNameRoleAnalysis: () => void;
  /** When true, the Review names modal is open. Used by Inspector to open it. */
  reviewNamesModalOpen: boolean;
  setReviewNamesModalOpen: (v: boolean) => void;
  loadTree: (projectId: string) => Promise<{ hadData: boolean }>;
  saveTree: () => Promise<boolean>;
  flushSaveAndSave: () => Promise<boolean>;
  clearTree: (projectId?: string) => void;
  removeNodes: (nodeIds: string[]) => void;
  /** For PDF export: viewport element to capture. Canvas registers on mount. */
  exportViewportEl: HTMLElement | null;
  setExportViewportEl: (el: HTMLElement | null) => void;
  /** For PDF export: fitView callback. Canvas registers on mount. */
  fitViewForExport: (() => void) | null;
  setFitViewForExport: (fn: (() => void) | null) => void;
  /** When set, nodes show notes during capture. Cleared after export. */
  exportCaptureFlags: { includeNotes: boolean } | null;
  setExportCaptureFlags: (f: { includeNotes: boolean } | null) => void;
  runLayout: () => boolean;
  /** Scoped Sort: repositions only the given union's partners + direct children. */
  sortUnion: (unionId: string) => boolean;
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
let prevNodeInfoSpacing: boolean | null = null;
let prevSingleChildAlignment: "left" | "center" | "right" | null = null;
let prevChildrenRowAlignment3Plus: "left" | "center" | "right" | null = null;
let prevPersistUnionSelectionOnChildCreate: boolean | null = null;
let prevScriptPanelLayout: "split" | "codeOnly" | "viewOnly" | null = null;
let prevShowGenerationAnchors: boolean | null = null;
let prevShowGenInheritIndicator: boolean | null = null;
let prevGenLabelMode: "letters" | "numbers" | "both" | null = null;
let prevGenerationAnchorsJson: string | null = null;
let prevConnectionStylesJson: string | null = null;

/** Performs sort/layout logic. Returns true if layout was applied, false if no valid unions. */
/**
 * Sort v2: scoped to a single selected union. Repositions only that union's two
 * partners, the union node itself, and its direct children — nothing else on the
 * canvas is moved. Partners are anchored near their current position (the left-most
 * partner stays put; the other is placed PARTNER_DX to its right); children are
 * placed below using the same alignment rules as the whole-tree Sort.
 */
function sortUnionImpl(get: () => FamilyTreeStore, unionId: string): boolean {
  const s = get();
  const {
    nodes,
    edges,
    nodeSizesById,
    snapToGrid,
    generationAnchors,
    singleChildAlignment,
    childrenRowAlignment3Plus,
    setNodes,
  } = s;

  const unionNode = nodes.find(
    (n) => n.id === unionId && (n.data as { kind?: string }).kind === "union"
  );
  if (!unionNode) return false;

  const unionData = unionNode.data as UnionNodeData;
  const partnerIds = unionData.partnerIds;
  if (!partnerIds || partnerIds.length !== 2) return false;

  const personById = new Map(
    nodes.filter((n) => (n.data as { kind?: string }).kind === "person").map((n) => [n.id, n])
  );

  const parents = partnerIds
    .map((id) => (id != null ? personById.get(id) : undefined))
    .filter((n): n is NonNullable<typeof n> => n != null);
  if (parents.length !== 2) return false;
  const [p0, p1] = parents;

  // Resolve left/right: prefer stored order, else current X position, else id order.
  let leftId: string;
  let rightId: string;
  if (unionData.leftPartnerId && unionData.rightPartnerId) {
    leftId = unionData.leftPartnerId;
    rightId = unionData.rightPartnerId;
  } else if (p0.position.x <= p1.position.x) {
    leftId = p0.id;
    rightId = p1.id;
  } else {
    leftId = p1.id;
    rightId = p0.id;
  }
  const leftNode = personById.get(leftId);
  const rightNode = personById.get(rightId);
  if (!leftNode || !rightNode) return false;

  const backfillNeeded = !unionData.leftPartnerId || !unionData.rightPartnerId;

  const snap = (x: number, y: number) => (snapToGrid ? snapPosition(x, y, true) : { x, y });
  const getW = (id: string) =>
    nodeSizesById[id]?.width ?? (personById.has(id) ? DEFAULT_PERSON_W : DEFAULT_UNION_W);

  const updateMap: Record<string, { x: number; y: number }> = {};

  // Anchor the geometrically left-most partner in place; place the other PARTNER_DX away.
  const anchorId = leftNode.position.x <= rightNode.position.x ? leftId : rightId;
  const otherId = anchorId === leftId ? rightId : leftId;
  const anchorNode = personById.get(anchorId)!;
  const partnerY = anchorNode.position.y;

  updateMap[anchorId] = snap(anchorNode.position.x, partnerY);
  updateMap[otherId] = snap(updateMap[anchorId]!.x + PARTNER_DX, partnerY);

  const leftPos = updateMap[leftId]!;
  const rightPos = updateMap[rightId]!;
  const wL = getW(leftId);
  const wR = getW(rightId);
  const parentCenterX = (leftPos.x + wL / 2 + rightPos.x + wR / 2) / 2;
  const unionY = partnerY + UNION_DY;
  const wU = getW(unionId);
  updateMap[unionId] = snap(parentCenterX - wU / 2, unionY);

  // Direct children of this union only (no grandchildren).
  const rawChildren = edges
    .filter((e) => e.source === unionId && isChildEdge(e))
    .map((e) => e.target)
    .filter((id) => personById.has(id))
    .sort((a, b) => a.localeCompare(b));

  const unionNodesAll = nodes.filter((n) => (n.data as { kind?: string }).kind === "union");
  const getEffectivePos = (nodeId: string) =>
    nodeId in updateMap ? updateMap[nodeId]! : nodes.find((n) => n.id === nodeId)?.position;

  /** Partner union ID for a child (parent in another union), or null. */
  const getPartnerUnionId = (childId: string): string | null => {
    const e = edges.find(
      (edge) =>
        isPartnerEdge(edge) &&
        edge.source === childId &&
        edge.target !== unionId &&
        unionNodesAll.some((u) => u.id === edge.target)
    );
    return e ? (e.target as string) : null;
  };

  const sortedChildIds = [...rawChildren].sort((a, b) => {
    const aPartner = getPartnerUnionId(a);
    const bPartner = getPartnerUnionId(b);

    const getPartnerCenterX = (uId: string): number | null => {
      const pos = getEffectivePos(uId);
      if (!pos) return null;
      return pos.x + getW(uId) / 2;
    };

    const aCenter = aPartner ? getPartnerCenterX(aPartner) : null;
    const bCenter = bPartner ? getPartnerCenterX(bPartner) : null;

    if (aPartner && !bPartner) {
      if (aCenter == null) return 1;
      return aCenter < parentCenterX ? -1 : 1;
    }
    if (!aPartner && bPartner) {
      if (bCenter == null) return -1;
      return bCenter < parentCenterX ? 1 : -1;
    }
    if (aPartner && bPartner) {
      if (aCenter == null && bCenter == null) return a.localeCompare(b);
      if (aCenter == null) return 1;
      if (bCenter == null) return -1;
      return aCenter - bCenter;
    }
    return a.localeCompare(b);
  });

  const childNodes = sortedChildIds
    .map((id) => personById.get(id))
    .filter((n): n is NonNullable<typeof n> => n != null);
  const baselineY = partnerY + CHILD_DY;
  const n = childNodes.length;

  if (n === 1) {
    const childW = getW(childNodes[0].id);
    let childX: number;
    if (singleChildAlignment === "left") {
      childX = leftPos.x;
    } else if (singleChildAlignment === "center") {
      childX = parentCenterX - childW / 2;
    } else {
      childX = rightPos.x;
    }
    updateMap[childNodes[0].id] = snap(childX, baselineY);
  } else if (n === 2) {
    const cw0 = getW(childNodes[0].id);
    const cw1 = getW(childNodes[1].id);
    updateMap[childNodes[0].id] = snap(leftPos.x + wL / 2 - cw0 / 2, baselineY);
    updateMap[childNodes[1].id] = snap(rightPos.x + wR / 2 - cw1 / 2, baselineY);
  } else if (n >= 3) {
    const childWidths = childNodes.map((c) => getW(c.id));
    const totalSpan = (n - 1) * UNIFORM_SPACING;
    let rowStartX: number;
    if (childrenRowAlignment3Plus === "left") {
      rowStartX = leftPos.x;
    } else if (childrenRowAlignment3Plus === "right") {
      rowStartX = rightPos.x + wR - totalSpan - childWidths[n - 1];
    } else {
      rowStartX = parentCenterX - totalSpan / 2 - childWidths[0] / 2;
    }
    for (let i = 0; i < childNodes.length; i++) {
      updateMap[childNodes[i].id] = snap(rowStartX + i * UNIFORM_SPACING, baselineY);
    }
  }

  // Re-snap Y for any in-scope person pinned to a generation anchor.
  const scopeIds = [leftId, rightId, ...sortedChildIds];
  for (const id of scopeIds) {
    const data = personById.get(id)?.data as { genAnchorId?: string | null } | undefined;
    if (data?.genAnchorId) {
      const genAnchor = generationAnchors.find((a) => a.id === data.genAnchorId);
      if (genAnchor) {
        const pos = updateMap[id];
        if (pos) {
          updateMap[id] = { x: pos.x, y: snap(pos.x, genAnchor.yTop + GEN_BASELINE_OFFSET).y };
        }
      }
    }
  }

  const backfill = backfillNeeded ? { leftPartnerId: leftId, rightPartnerId: rightId } : null;

  setNodes((prev) =>
    prev.map((node) => {
      const posUpdate = node.id in updateMap ? updateMap[node.id] : undefined;
      const dataUpdate = node.id === unionId && backfill ? backfill : undefined;
      if (posUpdate || dataUpdate) {
        return {
          ...node,
          ...(posUpdate && { position: posUpdate }),
          ...(dataUpdate && {
            data: { ...(node.data as UnionNodeData), ...dataUpdate },
          }),
        };
      }
      return node;
    })
  );

  return true;
}

/**
 * TODO(revisit): This is the original whole-tree layout, kept only for the PDF export
 * "Clean Layout" option. The toolbar Sort button now uses sortUnion (scoped to a single
 * selected union) instead, so these two layout behaviors have diverged. Revisit whether
 * export should keep this whole-tree behavior or be re-derived from sortUnion.
 */
function runLayoutImpl(get: () => FamilyTreeStore): boolean {
  const s = get();
  const {
    nodes,
    edges,
    nodeSizesById,
    snapToGrid,
    generationAnchors,
    singleChildAlignment,
    childrenRowAlignment3Plus,
    setNodes,
  } = s;

  const personNodes = nodes.filter((n) => (n.data as { kind?: string }).kind === "person");
  const unionNodes = nodes.filter((n) => (n.data as { kind?: string }).kind === "union");

  const snap = (x: number, y: number) =>
    snapToGrid ? snapPosition(x, y, true) : { x, y };

  const updateMap: Record<string, { x: number; y: number }> = {};

  if (personNodes.length === 2 && unionNodes.length === 0) {
    const anchor = personNodes[0].position.x <= personNodes[1].position.x ? personNodes[0] : personNodes[1];
    const other = anchor.id === personNodes[0].id ? personNodes[1] : personNodes[0];
    updateMap[other.id] = snap(anchor.position.x + PARTNER_DX, anchor.position.y);
    for (const n of personNodes) {
      const data = n.data as { genAnchorId?: string | null };
      if (data.genAnchorId) {
        const genAnchor = generationAnchors.find((a) => a.id === data.genAnchorId);
        if (genAnchor) {
          const pos = updateMap[n.id] ?? n.position;
          updateMap[n.id] = { x: pos.x, y: snap(pos.x, genAnchor.yTop + GEN_BASELINE_OFFSET).y };
        }
      }
    }
    setNodes((prev) =>
      prev.map((n) => (n.id in updateMap ? { ...n, position: updateMap[n.id] } : n))
    );
    return true;
  }

  const getEffectivePos = (nodeId: string) =>
    nodeId in updateMap ? updateMap[nodeId]! : nodes.find((n) => n.id === nodeId)?.position;

  const backfillMap: Record<string, { leftPartnerId: string; rightPartnerId: string }> = {};

  const personGen = computeGenerations(nodes, edges);
  const personById = new Map(personNodes.map((n) => [n.id, n]));
  const getW = (id: string) => nodeSizesById[id]?.width ?? (personById.has(id) ? DEFAULT_PERSON_W : DEFAULT_UNION_W);

  type UnionWithPartners = {
    union: (typeof unionNodes)[0];
    leftId: string;
    rightId: string;
    leftNode: (typeof nodes)[0];
    rightNode: (typeof nodes)[0];
    unionGen: number;
  };

  const validUnions: UnionWithPartners[] = [];
  for (const union of unionNodes) {
    const unionData = union.data as UnionNodeData;
    const partnerIds = unionData.partnerIds;
    if (!partnerIds || partnerIds.length !== 2) continue;
    const parents = partnerIds
      .map((id) => nodes.find((n) => n.id === id && (n.data as { kind?: string }).kind === "person"))
      .filter((n): n is NonNullable<typeof n> => n != null);
    if (parents.length !== 2) continue;
    const [p0, p1] = parents;
    const g0 = personGen[p0.id];
    const g1 = personGen[p1.id];
    if (g0 === undefined || g1 === undefined) continue;
    const [leftId, rightId] =
      p0.id <= p1.id ? [p0.id, p1.id] : [p1.id, p0.id];
    if (!unionData.leftPartnerId || !unionData.rightPartnerId) {
      const pos0 = getEffectivePos(p0.id);
      const pos1 = getEffectivePos(p1.id);
      if (pos0 && pos1) {
        const [lId, rId] = pos0.x <= pos1.x ? [p0.id, p1.id] : [p1.id, p0.id];
        backfillMap[union.id] = { leftPartnerId: lId, rightPartnerId: rId };
      } else {
        backfillMap[union.id] = { leftPartnerId: leftId, rightPartnerId: rightId };
      }
    }
    const finalLeft = (unionData.leftPartnerId && unionData.rightPartnerId)
      ? unionData.leftPartnerId
      : backfillMap[union.id]?.leftPartnerId ?? leftId;
    const finalRight = (unionData.leftPartnerId && unionData.rightPartnerId)
      ? unionData.rightPartnerId
      : backfillMap[union.id]?.rightPartnerId ?? rightId;
    const leftNode = personById.get(finalLeft);
    const rightNode = personById.get(finalRight);
    if (!leftNode || !rightNode) continue;
    const unionGen = Math.max(personGen[finalLeft] ?? 0, personGen[finalRight] ?? 0);
    validUnions.push({ union, leftId: finalLeft, rightId: finalRight, leftNode, rightNode, unionGen });
  }

  const unionsByGen = new Map<number, UnionWithPartners[]>();
  for (const u of validUnions) {
    const list = unionsByGen.get(u.unionGen) ?? [];
    list.push(u);
    unionsByGen.set(u.unionGen, list);
  }
  for (const list of unionsByGen.values()) {
    list.sort((a, b) => a.union.id.localeCompare(b.union.id));
  }

  const maxGen = Math.max(0, ...personNodes.map((n) => personGen[n.id] ?? 0));
  const childrenOfUnion = new Map<string, string[]>();
  for (const e of edges) {
    if (!isChildEdge(e)) continue;
    const arr = childrenOfUnion.get(e.source) ?? [];
    arr.push(e.target);
    childrenOfUnion.set(e.source, arr);
  }
  for (const arr of childrenOfUnion.values()) {
    arr.sort((a, b) => a.localeCompare(b));
  }

  /** Partner union ID for a child (parent in another union), or null. */
  const getPartnerUnionId = (childId: string, excludingUnionId: string): string | null => {
    const e = edges.find(
      (edge) =>
        (edge.data as { type?: string })?.type === "partner" &&
        edge.source === childId &&
        edge.target !== excludingUnionId &&
        unionNodes.some((u) => u.id === edge.target)
    );
    return e ? (e.target as string) : null;
  };

  /** Sort children: those with a partner union go toward that union; those without go to the outer side. */
  const sortChildrenForLayout = (
    childIds: string[],
    unionId: string,
    parentCenterX: number
  ): string[] =>
    [...childIds].sort((a, b) => {
      const aPartner = getPartnerUnionId(a, unionId);
      const bPartner = getPartnerUnionId(b, unionId);

      const getPartnerCenterX = (unionId: string): number | null => {
        const pos = getEffectivePos(unionId);
        if (!pos) return null;
        return pos.x + getW(unionId) / 2;
      };

      const aCenter = aPartner ? getPartnerCenterX(aPartner) : null;
      const bCenter = bPartner ? getPartnerCenterX(bPartner) : null;

      if (aPartner && !bPartner) {
        if (aCenter == null) return 1; // a has partner but no pos → right
        return aCenter < parentCenterX ? -1 : 1; // partner left → a left; partner right → a right
      }
      if (!aPartner && bPartner) {
        if (bCenter == null) return -1; // b has partner but no pos → b right, a left
        return bCenter < parentCenterX ? 1 : -1; // b's partner left → b left, a right; else a left, b right
      }
      if (aPartner && bPartner) {
        if (aCenter == null && bCenter == null) return a.localeCompare(b);
        if (aCenter == null) return 1;
        if (bCenter == null) return -1;
        return aCenter - bCenter; // both left-to-right by partner position
      }
      return a.localeCompare(b);
    });

  // Gen 0: collect all persons (roots + union partners) in order, assign uniform slots.
  const gen0PersonIds: string[] = [];
  const seen = new Set<string>();
  for (const pid of personNodes
    .filter((n) => (personGen[n.id] ?? 0) === 0)
    .map((n) => n.id)
    .sort((a, b) => a.localeCompare(b))) {
    if (!seen.has(pid)) {
      gen0PersonIds.push(pid);
      seen.add(pid);
    }
  }
  for (const { leftId, rightId } of unionsByGen.get(0) ?? []) {
    for (const pid of [leftId, rightId]) {
      if (!seen.has(pid)) {
        gen0PersonIds.push(pid);
        seen.add(pid);
      }
    }
  }
  for (let i = 0; i < gen0PersonIds.length; i++) {
    updateMap[gen0PersonIds[i]] = snap(i * UNIFORM_SPACING, 0);
  }

  const placeChildrenOfUnion = (
    union: (typeof validUnions)[0]["union"],
    leftId: string,
    rightId: string
  ) => {
    const leftPos = getEffectivePos(leftId);
    const rightPos = getEffectivePos(rightId);
    if (!leftPos || !rightPos) return;
    const rawChildren = childrenOfUnion.get(union.id) ?? [];
    const wL = getW(leftId);
    const wR = getW(rightId);
    const parentCenterX = (leftPos.x + wL / 2 + rightPos.x + wR / 2) / 2;
    const sortedIds = sortChildrenForLayout(rawChildren, union.id, parentCenterX);
    const childNodes = sortedIds
      .map((id) => personById.get(id))
      .filter((n): n is NonNullable<typeof n> => n != null);
    const unionGen = validUnions.find((u) => u.union.id === union.id)?.unionGen ?? 0;
    const baselineY = (unionGen + 1) * CHILD_DY;
    const n = childNodes.length;
    if (n === 0) return;

    const childWidths = childNodes.map((c) => getW(c.id));
    const unionCenterX = parentCenterX;

    if (n === 1) {
      const childW = childWidths[0];
      let childX: number;
      if (singleChildAlignment === "left") {
        childX = leftPos.x;
      } else if (singleChildAlignment === "center") {
        childX = unionCenterX - childW / 2;
      } else {
        childX = rightPos.x;
      }
      updateMap[childNodes[0].id] = snap(childX, baselineY);
    } else if (n === 2) {
      const cw0 = childWidths[0];
      const cw1 = childWidths[1];
      const leftChildX = leftPos.x + wL / 2 - cw0 / 2;
      const rightChildX = rightPos.x + wR / 2 - cw1 / 2;
      updateMap[childNodes[0].id] = snap(leftChildX, baselineY);
      updateMap[childNodes[1].id] = snap(rightChildX, baselineY);
    } else {
      const totalSpan = (n - 1) * UNIFORM_SPACING;
      let rowStartX: number;
      if (childrenRowAlignment3Plus === "left") {
        rowStartX = leftPos.x;
      } else if (childrenRowAlignment3Plus === "right") {
        rowStartX = rightPos.x + wR - totalSpan - childWidths[n - 1];
      } else {
        rowStartX = unionCenterX - totalSpan / 2 - childWidths[0] / 2;
      }
      for (let i = 0; i < childNodes.length; i++) {
        const cx = rowStartX + i * UNIFORM_SPACING;
        updateMap[childNodes[i].id] = snap(cx, baselineY);
      }
    }
  };

  for (let gen = 0; gen <= maxGen; gen++) {
    const personY = gen * CHILD_DY;
    const unionY = gen * CHILD_DY + UNION_DY;
    const levelUnions = unionsByGen.get(gen) ?? [];

    if (gen === 0) {
      for (let i = 0; i < levelUnions.length; i++) {
        const { union, leftId, rightId } = levelUnions[i];
        const wL = getW(leftId);
        const wR = getW(rightId);
        const pLx = i * 2 * UNIFORM_SPACING;
        const pRx = pLx + UNIFORM_SPACING;
        updateMap[leftId] = snap(pLx, personY);
        updateMap[rightId] = snap(pRx, personY);
        const wU = getW(union.id);
        const unionCenterX = (pLx + wL / 2 + pRx + wR / 2) / 2;
        const unionX = unionCenterX - wU / 2;
        updateMap[union.id] = snap(unionX, unionY);
      }
    } else {
      const parentUnions = unionsByGen.get(gen - 1) ?? [];
      for (const { union, leftId, rightId } of parentUnions) {
        placeChildrenOfUnion(union, leftId, rightId);
      }
      for (const { union, leftId, rightId } of levelUnions) {
        const leftPos = getEffectivePos(leftId);
        const rightPos = getEffectivePos(rightId);
        if (!leftPos || !rightPos) continue;
        const wL = getW(leftId);
        const wR = getW(rightId);
        const unionCenterX = (leftPos.x + wL / 2 + rightPos.x + wR / 2) / 2;
        const wU = getW(union.id);
        const unionX = unionCenterX - wU / 2;
        updateMap[union.id] = snap(unionX, unionY);
      }
    }
  }

  // Second pass: re-place children (using correct parent positions) and re-center unions.
  // Fixes layouts with dependency cycles where parents weren't placed yet on first pass.
  for (let gen = 0; gen <= maxGen; gen++) {
    const parentUnions = unionsByGen.get(gen) ?? [];
    for (const { union, leftId, rightId } of parentUnions) {
      placeChildrenOfUnion(union, leftId, rightId);
    }
  }
  for (const { union, leftId, rightId } of validUnions) {
    const leftPos = getEffectivePos(leftId);
    const rightPos = getEffectivePos(rightId);
    if (!leftPos || !rightPos) continue;
    const wL = getW(leftId);
    const wR = getW(rightId);
    const unionCenterX = (leftPos.x + wL / 2 + rightPos.x + wR / 2) / 2;
    const unionGen = validUnions.find((u) => u.union.id === union.id)?.unionGen ?? 0;
    const unionY = unionGen * CHILD_DY + UNION_DY;
    const wU = getW(union.id);
    const unionX = unionCenterX - wU / 2;
    updateMap[union.id] = snap(unionX, unionY);
  }

  if (Object.keys(updateMap).length === 0 && unionNodes.length > 0) {
    return false;
  }

  for (const n of personNodes) {
    const data = n.data as { genAnchorId?: string | null };
    if (data.genAnchorId) {
      const genAnchor = generationAnchors.find((a) => a.id === data.genAnchorId);
      if (genAnchor) {
        const pos = getEffectivePos(n.id) ?? n.position;
        updateMap[n.id] = { x: pos.x, y: snap(pos.x, genAnchor.yTop + GEN_BASELINE_OFFSET).y };
      }
    }
  }

  setNodes((prev) =>
    prev.map((n) => {
      const posUpdate = n.id in updateMap ? updateMap[n.id] : undefined;
      const dataUpdate =
        n.type === "union" && n.id in backfillMap ? backfillMap[n.id] : undefined;
      if (posUpdate || dataUpdate) {
        return {
          ...n,
          ...(posUpdate && { position: posUpdate }),
          ...(dataUpdate && {
            data: { ...(n.data as UnionNodeData), ...dataUpdate },
          }),
        };
      }
      return n;
    })
  );
  return true;
}

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
  nodeInfoSpacing: false,
  singleChildAlignment: "left",
  childrenRowAlignment3Plus: "center",
  persistUnionSelectionOnChildCreate: true,
  scriptPanelLayout: "split",
  scriptCompactDeclarations: false,
  showGenerationAnchors: true,
  showGenInheritIndicator: true,
  generationAnchors: [],
  connectionStyles: [],
  editingAnchorIds: [] as string[],
  genLabelMode: "letters",
  genInheritFlashByNodeId: {},
  pendingGenChangePrompt: null,
  marqueeToolActive: false,
  isSpacePanning: false,
  exportGuidesVisible: false,
  showLegend: false,
  exportGuideScale: 1,
  showExportDialog: false,
  exportOptions: {
    layoutMode: "currentView" as const,
    includeNotes: true,
    includeLegend: false,
    showGenerationBands: true,
  },
  hasUnsavedChanges: false,
  isSaving: false,
  lastSavedAt: null,
  lastSaveError: null,
  autosaveEnabled: true,
  defaultUnionType: "forward" as UnionType,
  exportViewportEl: null as HTMLElement | null,
  fitViewForExport: null as (() => void) | null,
  exportCaptureFlags: null as { includeNotes: boolean } | null,
  nameRoleSuggestions: [] as NameRoleSuggestion[],
  reviewNamesModalOpen: false,

  setExportViewportEl: (el) => set({ exportViewportEl: el }),
  setFitViewForExport: (fn) => set({ fitViewForExport: fn }),
  setExportCaptureFlags: (f) => set({ exportCaptureFlags: f }),
  runLayout: () => runLayoutImpl(get),
  sortUnion: (unionId) => sortUnionImpl(get, unionId),
  runNameRoleAnalysis: () => {
    const s = get();
    set({ nameRoleSuggestions: analyzeNameAndRoleSuggestions(s.nodes, s.edges) });
  },
  setReviewNamesModalOpen: (v) => set({ reviewNamesModalOpen: v }),
  setSnapToGrid: (v) => set({ snapToGrid: v }),
  setShowNodeInfoEnabled: (v) =>
    set({ showNodeInfoEnabled: v, hasUnsavedChanges: true, lastSaveError: null }),
  setNodeInfoTopLeft: (v) =>
    set((s) => {
      if (!v && !s.nodeInfoCenter && !s.nodeInfoSize && !s.nodeInfoSpacing) return {};
      return { nodeInfoTopLeft: v, hasUnsavedChanges: true, lastSaveError: null };
    }),
  setNodeInfoCenter: (v) =>
    set((s) => {
      if (!v && !s.nodeInfoTopLeft && !s.nodeInfoSize && !s.nodeInfoSpacing) return {};
      return { nodeInfoCenter: v, hasUnsavedChanges: true, lastSaveError: null };
    }),
  setNodeInfoSize: (v) =>
    set((s) => {
      if (!v && !s.nodeInfoTopLeft && !s.nodeInfoCenter && !s.nodeInfoSpacing) return {};
      return { nodeInfoSize: v, hasUnsavedChanges: true, lastSaveError: null };
    }),
  setNodeInfoSpacing: (v) =>
    set((s) => {
      if (!v && !s.nodeInfoTopLeft && !s.nodeInfoCenter && !s.nodeInfoSize) return {};
      return { nodeInfoSpacing: v, hasUnsavedChanges: true, lastSaveError: null };
    }),
  setPersistUnionSelectionOnChildCreate: (v) =>
    set({ persistUnionSelectionOnChildCreate: v, hasUnsavedChanges: true, lastSaveError: null }),
  setScriptPanelLayout: (v) =>
    set({ scriptPanelLayout: v, hasUnsavedChanges: true, lastSaveError: null }),
  setScriptCompactDeclarations: (v) => set({ scriptCompactDeclarations: v }),
  setShowGenerationAnchors: (v) =>
    set({ showGenerationAnchors: v, hasUnsavedChanges: true, lastSaveError: null }),
  setShowGenInheritIndicator: (v) =>
    set({ showGenInheritIndicator: v, hasUnsavedChanges: true, lastSaveError: null }),
  addGenerationAnchor: () =>
    set((s) => {
      const DEFAULT_HEIGHT = 224;
      const GAP = 32;
      let yTop: number;
      let index: number;
      if (s.generationAnchors.length === 0) {
        yTop = 80;
        index = 0;
      } else {
        const last = s.generationAnchors[s.generationAnchors.length - 1]!;
        yTop = last.yTop + last.height + GAP;
        index = last.index + 1;
      }
      const id = generateId();
      const anchor: GenerationAnchor = { id, index, yTop, height: DEFAULT_HEIGHT };
      return {
        generationAnchors: [...s.generationAnchors, anchor],
        editingAnchorIds: [...s.editingAnchorIds, id],
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    }),
  enterAnchorEditMode: (anchorId) =>
    set((s) => {
      if (s.editingAnchorIds.includes(anchorId)) return {};
      return { editingAnchorIds: [...s.editingAnchorIds, anchorId] };
    }),
  confirmAnchor: (anchorId) =>
    set((s) => {
      const next = s.editingAnchorIds.filter((id) => id !== anchorId);
      if (next.length === s.editingAnchorIds.length) return {};
      return { editingAnchorIds: next };
    }),
  removeGenerationAnchor: (anchorId) =>
    set((s) => {
      const nextAnchors = s.generationAnchors
        .filter((a) => a.id !== anchorId)
        .map((a, i) => ({ ...a, index: i }));
      const nextEditing = s.editingAnchorIds.filter((id) => id !== anchorId);
      const nodes = s.nodes.map((n) => {
        if (n.data.kind !== "person") return n;
        const d = n.data as PersonNodeData;
        if (d.genAnchorId !== anchorId) return n;
        return { ...n, data: { ...d, genAnchorId: null } };
      });
      return {
        generationAnchors: nextAnchors,
        editingAnchorIds: nextEditing,
        nodes,
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    }),
  updateGenerationAnchorLabel: (anchorId, customLabel) =>
    set((s) => ({
      generationAnchors: s.generationAnchors.map((a) =>
        a.id === anchorId ? { ...a, customLabel: customLabel.trim() || undefined } : a
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  updateGenerationAnchorBounds: (anchorId, updates) =>
    set((s) => ({
      generationAnchors: s.generationAnchors.map((a) => {
        if (a.id !== anchorId) return a;
        const next = { ...a };
        if (typeof updates.yTop === "number") next.yTop = updates.yTop;
        if (typeof updates.height === "number" && updates.height >= 32) next.height = updates.height;
        return next;
      }),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  addConnectionStyle: (style) => {
    const id = generateId();
    set((s) => ({
      connectionStyles: [...s.connectionStyles, { ...style, id }],
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
    return id;
  },
  updateConnectionStyle: (id, patch) =>
    set((s) => ({
      connectionStyles: s.connectionStyles.map((st) => (st.id === id ? { ...st, ...patch } : st)),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  deleteConnectionStyle: (id) =>
    set((s) => ({
      connectionStyles: s.connectionStyles.filter((st) => st.id !== id),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  duplicateConnectionStyle: (id) => {
    const source = get().connectionStyles.find((st) => st.id === id);
    if (!source) return null;
    const newId = generateId();
    set((s) => ({
      connectionStyles: [
        ...s.connectionStyles,
        {
          ...source,
          id: newId,
          name: `${source.name} copy`,
        },
      ],
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
    return newId;
  },
  setUnionConnectionStyleId: (unionId, styleId) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== unionId || (n.data as UnionNodeData).kind !== "union") return n;
        const d = n.data as UnionNodeData;
        return {
          ...n,
          data: {
            ...d,
            connectionStyleId: styleId,
            connectionStyleOverride: undefined,
          },
        };
      }),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  setUnionConnectionStyleOverride: (unionId, style) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== unionId || (n.data as UnionNodeData).kind !== "union") return n;
        const d = n.data as UnionNodeData;
        return {
          ...n,
          data: {
            ...d,
            connectionStyleOverride: style,
          },
        };
      }),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  setGenLabelMode: (v) =>
    set({ genLabelMode: v, hasUnsavedChanges: true, lastSaveError: null }),
  setNodeGenArmed: (nodeId) =>
    set((s) => {
      const node = s.nodes.find((n) => n.id === nodeId && n.data.kind === "person");
      if (!node || (node.data as PersonNodeData).isGenArmed === true) return {};
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId && n.data.kind === "person"
            ? { ...n, data: { ...n.data, isGenArmed: true } }
            : n
        ),
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    }),
  updateNodeGenAnchor: (nodeId, genAnchorId) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId && n.data.kind === "person"
          ? { ...n, data: { ...n.data, genAnchorId } }
          : n
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  setGenInheritFlash: (nodeId, label) => {
    if (!get().showGenInheritIndicator) return;
    const token = Date.now();
    set((s) => ({ genInheritFlashByNodeId: { ...s.genInheritFlashByNodeId, [nodeId]: { token, label } } }));
    setTimeout(() => {
      get().clearGenInheritFlash(nodeId);
    }, 900);
  },
  clearGenInheritFlash: (nodeId) =>
    set((s) => {
      const next = { ...s.genInheritFlashByNodeId };
      delete next[nodeId];
      return { genInheritFlashByNodeId: next };
    }),
  setPendingGenChangePrompt: (p) => set({ pendingGenChangePrompt: p }),
  resolveGenChangePrompt: (choice) =>
    set((s) => {
      const p = s.pendingGenChangePrompt;
      if (!p) return {};
      if (choice === "update") {
        return {
          pendingGenChangePrompt: null,
          nodes: s.nodes.map((n) =>
            n.id === p.nodeId && n.data.kind === "person"
              ? { ...n, data: { ...n.data, genAnchorId: p.toAnchorId } }
              : n
          ),
          hasUnsavedChanges: true,
          lastSaveError: null,
        };
      }
      return {
        pendingGenChangePrompt: null,
        nodes: s.nodes.map((n) =>
          n.id === p.nodeId ? { ...n, position: p.previousPosition } : n
        ),
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    }),
  setMarqueeToolActive: (v) => set({ marqueeToolActive: v }),
  setIsSpacePanning: (v) => set({ isSpacePanning: v }),
  setExportGuidesVisible: (v) => set({ exportGuidesVisible: v }),
  setShowLegend: (v) => set({ showLegend: v }),
  setExportGuideScale: (v) =>
    set({ exportGuideScale: Math.max(0.25, Math.min(6, v)) }),
  setShowExportDialog: (v) => set({ showExportDialog: v }),
  setExportOptions: (opts) =>
    set((s) => ({
      exportOptions: { ...s.exportOptions, ...opts },
    })),
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

  addPerson: (options) => {
    const id = generateId();
    const state = get();
    const { nodes, anchorNodeId, viewportBounds, snapToGrid, generationAnchors, genLabelMode, showGenInheritIndicator } = state;
    const genAnchorId = options?.genAnchorId;
    const anchor = genAnchorId ? generationAnchors.find((a) => a.id === genAnchorId) : null;

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

    const findPositionInAnchorBand = (anchor: GenerationAnchor) => {
      const baselineY = anchor.yTop + GEN_BASELINE_OFFSET;
      let baseX: number;
      if (viewportBounds) {
        baseX = (viewportBounds.minX + viewportBounds.maxX) / 2 - PLACEMENT_NODE_WIDTH / 2;
      } else {
        baseX = 100;
      }
      const cascadeStep = 16;
      const maxCascade = 8;
      for (let k = 0; k < maxCascade; k++) {
        const candX = baseX + k * cascadeStep;
        const candY = baselineY + k * cascadeStep;
        const pos = tryPosition(candX, candY);
        if (isSpotFree(pos.x, pos.y, nodes, [])) return pos;
      }
      return tryPosition(baseX, baselineY);
    };

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    let position: { x: number; y: number };
    let data: PersonNodeData;

    const nextNum = nextPersonNumber(nodes);
    if (anchor) {
      position = findPositionInAnchorBand(anchor);
      data = { kind: "person", name: `Person ${nextNum}`, firstName: `Person ${nextNum}`, middleName: "", lastName: "", notes: "", nicknames: [], genAnchorId: anchor.id, isGenArmed: true };
    } else if (anchorNodeId) {
      const anchorNode = nodes.find((n) => n.id === anchorNodeId);
      if (!anchorNode) {
        const maxY = nodes.reduce((max, n) => Math.max(max, n.position.y), 0);
        position = tryPosition(Math.random() * 200, maxY + 80);
      } else {
        position = findFreeSlot(anchorNode.position.x, anchorNode.position.y, [anchorNodeId]);
      }
      data = { kind: "person", name: `Person ${nextNum}`, firstName: `Person ${nextNum}`, middleName: "", lastName: "", notes: "", nicknames: [], isGenArmed: false };
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
      data = { kind: "person", name: `Person ${nextNum}`, firstName: `Person ${nextNum}`, middleName: "", lastName: "", notes: "", nicknames: [], isGenArmed: false };
    } else {
      const maxY = nodes.reduce((max, n) => Math.max(max, n.position.y), 0);
      position = tryPosition(Math.random() * 200, maxY + 80);
      data = { kind: "person", name: `Person ${nextNum}`, firstName: `Person ${nextNum}`, middleName: "", lastName: "", notes: "", nicknames: [], isGenArmed: false };
    }

    const newNode: Node<PersonNodeData> = { id, type: "person", position, data };
    set((s) => ({ nodes: [...s.nodes, newNode], hasUnsavedChanges: true, lastSaveError: null }));

    if (anchor && showGenInheritIndicator) {
      const label = formatGenerationAnchorLabel(anchor, genLabelMode);
      get().setGenInheritFlash(id, label);
    }
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
        unionType: "forward",
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
      data: { kind: "person", name: `Person ${nextNum}`, firstName: `Person ${nextNum}`, middleName: "", lastName: "", notes: "", nicknames: [], isGenArmed: false },
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

  setDefaultUnionType: (t) => set({ defaultUnionType: t }),

  createBackwardUnion: (childNodeIds) => {
    const state = get();
    const childNodes = childNodeIds
      .map((id) => state.nodes.find((n) => n.id === id))
      .filter((n): n is NonNullable<typeof n> => n != null && n.type === "person");
    if (childNodes.length !== childNodeIds.length) return null;

    const unionId = generateId();
    const children = childNodes.length === 1 ? [childNodes[0]!] : [childNodes[0]!, childNodes[1]!];
    const minY = Math.min(...children.map((c) => c.position.y));
    const midX =
      children.length === 1
        ? children[0]!.position.x
        : (children[0]!.position.x + children[1]!.position.x) / 2;
    const unionY = minY - UNION_DY;
    const unionNode: Node<UnionNodeData> = {
      id: unionId,
      type: "union",
      position: { x: midX - DEFAULT_UNION_W / 2, y: unionY },
      data: {
        kind: "union",
        partnerIds: [null, null],
        notes: "",
        unionType: "backward",
      },
    };

    const childEdges: Edge[] = children.map((c) => ({
      id: `e-${unionId}-${c.id}`,
      source: unionId,
      target: c.id,
      sourceHandle: "children",
      targetHandle: "parent",
      data: { type: "child" },
    }));

    set((s) => ({
      nodes: [...s.nodes, unionNode],
      edges: [...s.edges, ...childEdges],
      selectedNodeIds: [unionId],
      primarySelectedNodeId: unionId,
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
    return unionId;
  },

  addParent: (unionNodeId) => {
    const state = get();
    const unionNode = state.nodes.find(
      (n) => n.id === unionNodeId && (n.data as UnionNodeData).kind === "union"
    );
    if (!unionNode) return null;
    const unionData = unionNode.data as UnionNodeData;
    if (unionData.unionType !== "backward") return null;
    const partnerIds = unionData.partnerIds ?? [null, null];
    const filled = partnerIds.filter((id): id is string => id != null).length;
    if (filled >= 2) return null;

    const nextNum = nextPersonNumber(state.nodes);
    const parentId = generateId();
    const unionAboveY = unionNode.position.y;
    const newPersonNode: Node<PersonNodeData> = {
      id: parentId,
      type: "person",
      position: {
        x: unionNode.position.x,
        y: unionAboveY - UNION_DY - DEFAULT_PERSON_H,
      },
      data: { kind: "person", name: `Person ${nextNum}`, firstName: `Person ${nextNum}`, middleName: "", lastName: "", notes: "", nicknames: [], isGenArmed: false },
    };

    const idx = partnerIds[0] == null ? 0 : 1;
    const newPartnerIds: [string | null, string | null] = [...partnerIds];
    newPartnerIds[idx] = parentId;

    const partnerEdge: Edge = {
      id: `e-${parentId}-${unionNodeId}`,
      source: parentId,
      target: unionNodeId,
      sourceHandle: "partner",
      targetHandle: "partners",
      data: { type: "partner" },
    };

    const leftId = newPartnerIds[0];
    const rightId = newPartnerIds[1];
    const leftPartnerId = leftId ?? undefined;
    const rightPartnerId = rightId ?? undefined;

    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === unionNodeId
          ? { ...n, data: { ...unionData, partnerIds: newPartnerIds, leftPartnerId, rightPartnerId } }
          : n
      ).concat(newPersonNode),
      edges: [...s.edges, partnerEdge],
      selectedNodeIds: state.persistUnionSelectionOnChildCreate ? [unionNodeId] : [parentId],
      primarySelectedNodeId: state.persistUnionSelectionOnChildCreate ? unionNodeId : parentId,
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
    return parentId;
  },

  linkPersonToUnion: (unionId, personId, mode) => {
    const state = get();
    const unionNode = state.nodes.find(
      (n) => n.id === unionId && (n.data as UnionNodeData).kind === "union"
    );
    if (!unionNode) return "Union not found.";
    const personNode = state.nodes.find(
      (n) => n.id === personId && (n.data as { kind?: string }).kind === "person"
    );
    if (!personNode) return "Person not found.";
    const unionData = unionNode.data as UnionNodeData;
    const partnerIds = unionData.partnerIds ?? [null, null];
    const partnerEdgeExists = state.edges.some(
      (e) =>
        (e.data as { type?: string })?.type === "partner" &&
        e.source === personId &&
        e.target === unionId
    );
    const childEdgeExists = state.edges.some(
      (e) =>
        (e.data as { type?: string })?.type === "child" &&
        e.source === unionId &&
        e.target === personId
    );

    if (mode === "forward") {
      if (unionData.unionType !== "backward") return "Only backward unions can add parents.";
      const filled = partnerIds.filter((id): id is string => id != null).length;
      if (filled >= 2) return "Union already has 2 parents.";
      if (partnerEdgeExists) return "Person is already a parent of this union.";
      const idx = partnerIds[0] == null ? 0 : 1;
      const newPartnerIds: [string | null, string | null] = [...partnerIds];
      newPartnerIds[idx] = personId;
      const leftId = newPartnerIds[0];
      const rightId = newPartnerIds[1];
      const partnerEdge: Edge = {
        id: `e-${personId}-${unionId}`,
        source: personId,
        target: unionId,
        sourceHandle: "partner",
        targetHandle: "partners",
        data: { type: "partner" },
      };
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === unionId
            ? {
                ...n,
                data: {
                  ...unionData,
                  partnerIds: newPartnerIds,
                  leftPartnerId: leftId ?? undefined,
                  rightPartnerId: rightId ?? undefined,
                },
              }
            : n
        ),
        edges: [...s.edges, partnerEdge],
        selectedNodeIds: [unionId],
        primarySelectedNodeId: unionId,
        hasUnsavedChanges: true,
        lastSaveError: null,
      }));
      return null;
    }

    if (mode === "backward") {
      if (childEdgeExists) return "Person is already a child of this union.";
      const childEdge: Edge = {
        id: `e-${unionId}-${personId}`,
        source: unionId,
        target: personId,
        sourceHandle: "children",
        targetHandle: "parent",
        data: { type: "child" },
      };
      set((s) => ({
        edges: [...s.edges, childEdge],
        selectedNodeIds: [unionId],
        primarySelectedNodeId: unionId,
        hasUnsavedChanges: true,
        lastSaveError: null,
      }));
      return null;
    }

    return "Invalid mode.";
  },

  swapPersonUnionSides: (personId) => {
    const state = get();
    const personNode = state.nodes.find(
      (n) => n.id === personId && (n.data as { kind?: string }).kind === "person"
    );
    if (!personNode) return false;
    const partnerEdges = state.edges.filter(
      (e) =>
        (e.data as { type?: string })?.type === "partner" && e.source === personId
    );
    if (partnerEdges.length < 2) return false;
    const unionIds = [...new Set(partnerEdges.map((e) => e.target))].sort((a, b) => a.localeCompare(b));
    const data = personNode.data as PersonNodeData;
    const stored = data.partnerUnionOrder ?? [];
    const ordered = [...stored].filter((id) => unionIds.includes(id));
    for (const id of unionIds) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    ordered.sort((a, b) => {
      const iA = stored.indexOf(a);
      const iB = stored.indexOf(b);
      if (iA >= 0 && iB >= 0) return iA - iB;
      if (iA >= 0) return -1;
      if (iB >= 0) return 1;
      return a.localeCompare(b);
    });
    const reversed = [...ordered].reverse();
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === personId && (n.data as { kind?: string }).kind === "person"
          ? { ...n, data: { ...(n.data as PersonNodeData), partnerUnionOrder: reversed } }
          : n
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
    return true;
  },

  moveChildToUnion: (childId, fromUnionId, toUnionId) => {
    const state = get();
    if (fromUnionId === toUnionId) return false;
    const fromUnion = state.nodes.find((n) => n.id === fromUnionId && (n.data as UnionNodeData).kind === "union");
    const toUnion = state.nodes.find((n) => n.id === toUnionId && (n.data as UnionNodeData).kind === "union");
    const childNode = state.nodes.find((n) => n.id === childId && (n.data as { kind?: string }).kind === "person");
    if (!fromUnion || !toUnion || !childNode) return false;
    const childEdge = state.edges.find(
      (e) => (e.data as { type?: string })?.type === "child" && e.source === fromUnionId && e.target === childId
    );
    if (!childEdge) return false;
    const newChildEdge: Edge = {
      id: `e-${toUnionId}-${childId}`,
      source: toUnionId,
      target: childId,
      sourceHandle: "children",
      targetHandle: "parent",
      data: { type: "child" },
    };
    set((s) => ({
      edges: s.edges
        .filter((e) => e.id !== childEdge.id)
        .concat(newChildEdge),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
    return true;
  },

  removePartnerFromUnion: (unionId, personId) => {
    const state = get();
    const unionNode = state.nodes.find((n) => n.id === unionId && (n.data as UnionNodeData).kind === "union");
    if (!unionNode) return "Union not found.";
    const data = unionNode.data as UnionNodeData;
    const partnerIds = data.partnerIds ?? [null, null];
    const leftId = data.leftPartnerId ?? partnerIds[0];
    const rightId = data.rightPartnerId ?? partnerIds[1];
    const partners = [leftId, rightId].filter((id): id is string => id != null);
    if (partners.length <= 1 && partners[0] === personId)
      return "Cannot remove the last parent from a union.";
    let slot: 0 | 1;
    if (leftId === personId) slot = 0;
    else if (rightId === personId) slot = 1;
    else return "Person is not a partner of this union.";
    const newPartnerIds: [string | null, string | null] = [...partnerIds];
    newPartnerIds[slot] = null;
    const newLeftId = newPartnerIds[0] ?? undefined;
    const newRightId = newPartnerIds[1] ?? undefined;
    const partnerEdge = state.edges.find(
      (e) => (e.data as { type?: string })?.type === "partner" && e.source === personId && e.target === unionId
    );
    if (!partnerEdge) return "Partner edge not found.";
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === unionId
          ? { ...n, data: { ...data, partnerIds: newPartnerIds, leftPartnerId: newLeftId, rightPartnerId: newRightId } }
          : n
      ),
      edges: s.edges.filter((e) => e.id !== partnerEdge.id),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
    return null;
  },

  removeChildFromUnion: (unionId, childId) => {
    const state = get();
    const childEdge = state.edges.find(
      (e) => (e.data as { type?: string })?.type === "child" && e.source === unionId && e.target === childId
    );
    if (!childEdge) return "Child not found in this union.";
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== childEdge.id),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
    return null;
  },

  updateNodeName: (nodeId, name) => {
    set((s) => {
      const unknownLabel = isUnknownPlaceholder(name)
        ? `Unknown ${getMaxUnknownNumber(s.nodes) + 1}`
        : null;
      const resolved = unknownLabel ?? (isUnknownPlaceholder(name) ? "?" : name);
      const firstName = unknownLabel ?? (isUnknownPlaceholder(name) ? "?" : name);
      const middleName = unknownLabel ? "" : "";
      const lastName = "";
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId && isPersonData(n.data)
            ? {
                ...n,
                data: {
                  ...(n.data as PersonNodeData),
                  name: unknownLabel ?? resolved,
                  firstName,
                  middleName,
                  lastName,
                },
              }
            : n
        ),
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    });
  },

  updatePersonNameParts: (nodeId, { firstName, middleName, lastName }) => {
    const resolve = (s: string) => (isUnknownPlaceholder(s) ? "?" : s);
    const f = resolve(firstName.trim());
    const m = resolve(middleName.trim());
    const l = resolve(lastName.trim());
    const allThreeUnknown = f === "?" && m === "?" && l === "?";
    set((s) => {
      const finalFirst = allThreeUnknown ? `Unknown ${getMaxUnknownNumber(s.nodes) + 1}` : f;
      const finalMiddle = allThreeUnknown ? "" : m;
      const finalLast = allThreeUnknown ? "" : l;
      const parts = [finalFirst, finalMiddle, finalLast].filter(Boolean);
      const name = parts.join(" ") || "New Person";
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId && isPersonData(n.data)
            ? { ...n, data: { ...(n.data as PersonNodeData), firstName: finalFirst, middleName: finalMiddle, lastName: finalLast, name } }
            : n
        ),
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    });
  },

  updatePersonNicknames: (nodeId, nicknames) => {
    const resolved = nicknames.map((v) => (isUnknownPlaceholder(v) ? "?" : v));
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId && isPersonData(n.data)
          ? { ...n, data: { ...(n.data as PersonNodeData), nicknames: resolved } }
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

  updateUnionPartnerRole: (unionId, slot, role) => {
    set((s) => {
      const union = s.nodes.find(
        (n) => n.id === unionId && (n.data as UnionNodeData).kind === "union"
      );
      if (!union) return {};
      const data = union.data as UnionNodeData;
      const leftId = data.leftPartnerId ?? data.partnerIds?.[0];
      const rightId = data.rightPartnerId ?? data.partnerIds?.[1];
      const personId = slot === "left" ? leftId : rightId;
      const otherRole = slot === "left" ? data.rightPartnerRole : data.leftPartnerRole;

      let leftRole: ParentRole | undefined;
      let rightRole: ParentRole | undefined;
      if (role == null) {
        // "Not set" → clear both partners in this union so the role stays unset
        leftRole = undefined;
        rightRole = undefined;
      } else {
        // Assigning: clear the same role from the other slot
        const newOther = otherRole === role ? undefined : otherRole;
        leftRole = slot === "left" ? role : newOther;
        rightRole = slot === "right" ? role : newOther;
      }

      // Propagate: only when setting a non-null role; unsetting does not propagate
      const updates = new Map<string, { leftRole?: ParentRole; rightRole?: ParentRole }>();
      updates.set(unionId, { leftRole, rightRole });
      if (role != null && personId) {
        for (const n of s.nodes) {
          if (n.id === unionId || (n.data as UnionNodeData).kind !== "union") continue;
          const d = n.data as UnionNodeData;
          const uLeftId = d.leftPartnerId ?? d.partnerIds?.[0];
          const uRightId = d.rightPartnerId ?? d.partnerIds?.[1];
          if (uLeftId === personId)
            updates.set(n.id, { ...(updates.get(n.id) ?? {}), leftRole: role });
          if (uRightId === personId)
            updates.set(n.id, { ...(updates.get(n.id) ?? {}), rightRole: role });
        }
      }

      return {
        nodes: s.nodes.map((n) => {
          const patch = updates.get(n.id);
          if (!patch) return n;
          const nd = n.data as UnionNodeData;
          return {
            ...n,
            data: {
              ...nd,
              leftPartnerRole: "leftRole" in patch ? (patch.leftRole ?? undefined) : nd.leftPartnerRole,
              rightPartnerRole: "rightRole" in patch ? (patch.rightRole ?? undefined) : nd.rightPartnerRole,
            },
          };
        }),
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    });
  },

  swapUnionHandleSides: (unionId) => {
    const state = get();
    const union = state.nodes.find(
      (n) => n.id === unionId && (n.data as UnionNodeData).kind === "union"
    );
    if (!union) return false;
    const data = union.data as UnionNodeData;
    const leftId = data.leftPartnerId ?? data.partnerIds?.[0];
    const rightId = data.rightPartnerId ?? data.partnerIds?.[1];
    if (!leftId || !rightId) return false;
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === unionId
          ? {
              ...n,
              data: {
                ...(n.data as UnionNodeData),
                partnerHandleSwap: !(n.data as UnionNodeData).partnerHandleSwap,
              },
            }
          : n
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
    return true;
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
              leftPartnerRole: data.rightPartnerRole,
              rightPartnerRole: data.leftPartnerRole,
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
    const rawNodes = (payload?.nodes ?? []) as Node<FamilyTreeNodeData>[];
    const nodes = normalizeUnknownNames(rawNodes);
    const edges = (payload?.edges ?? []) as Edge[];
    const hadData = payload != null;
    const savedAlignment = payload?.ui?.singleChildAlignment;
    set({
      activeProjectId: projectId,
      nodes,
      edges,
      anchorNodeId: payload?.anchorNodeId ?? null,
      generationAnchors: (payload as { generationAnchors?: GenerationAnchor[] })?.generationAnchors ?? [],
      connectionStyles: payload?.connectionStyles ?? [],
      snapToGrid: payload?.ui?.snapToGrid ?? true,
      genLabelMode:
        (payload?.ui?.genLabelMode === "numbers" || payload?.ui?.genLabelMode === "both"
          ? payload.ui.genLabelMode
          : "letters"),
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
      nodeInfoSpacing: payload?.ui?.nodeInfoSpacing ?? false,
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
      showGenerationAnchors: payload?.ui?.showGenerationAnchors ?? true,
      showGenInheritIndicator: payload?.ui?.showGenInheritIndicator ?? true,
      defaultUnionType:
        (payload?.ui?.defaultUnionType === "forward" || payload?.ui?.defaultUnionType === "backward")
          ? payload.ui.defaultUnionType
          : "forward",
      selectedNodeIds: [],
      primarySelectedNodeId: null,
      nodeSizesById: {},
      viewportBounds: null,
      hasUnsavedChanges: false,
      lastSaveError: null,
      genInheritFlashByNodeId: {},
      pendingGenChangePrompt: null,
      reviewNamesModalOpen: false,
      editingAnchorIds: [],
    });
    get().runNameRoleAnalysis();
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
        generationAnchors: s.generationAnchors,
        connectionStyles: s.connectionStyles,
        ui: {
          genLabelMode: s.genLabelMode,
          showGenerationAnchors: s.showGenerationAnchors,
          showGenInheritIndicator: s.showGenInheritIndicator,
          snapToGrid: s.snapToGrid,
          showNodeInfoEnabled: s.showNodeInfoEnabled,
          nodeInfoTopLeft: s.nodeInfoTopLeft,
          nodeInfoCenter: s.nodeInfoCenter,
          nodeInfoSize: s.nodeInfoSize,
          nodeInfoSpacing: s.nodeInfoSpacing,
          singleChildAlignment: s.singleChildAlignment,
          childrenRowAlignment3Plus: s.childrenRowAlignment3Plus,
          persistUnionSelectionOnChildCreate: s.persistUnionSelectionOnChildCreate,
          scriptPanelLayout: s.scriptPanelLayout,
          defaultUnionType: s.defaultUnionType,
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

  removeNodes: (nodeIds) => {
    if (nodeIds.length === 0) return;
    const ids = new Set(nodeIds);
    set((s) => {
      const newNodes = s.nodes.filter((n) => !ids.has(n.id));
      const newEdges = s.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target));
      const newSelectedIds = s.selectedNodeIds.filter((id) => !ids.has(id));
      const newPrimary = newSelectedIds[0] ?? null;
      const newAnchorId = s.anchorNodeId && ids.has(s.anchorNodeId) ? null : s.anchorNodeId;
      const newPendingGen =
        s.pendingGenChangePrompt && ids.has(s.pendingGenChangePrompt.nodeId) ? null : s.pendingGenChangePrompt;
      const newNodeSizesById = { ...s.nodeSizesById };
      for (const id of ids) delete newNodeSizesById[id];
      const newGenInheritFlash = { ...s.genInheritFlashByNodeId };
      for (const id of ids) delete newGenInheritFlash[id];
      return {
        nodes: newNodes,
        edges: newEdges,
        selectedNodeIds: newSelectedIds,
        primarySelectedNodeId: newPrimary,
        anchorNodeId: newAnchorId,
        nodeSizesById: newNodeSizesById,
        genInheritFlashByNodeId: newGenInheritFlash,
        pendingGenChangePrompt: newPendingGen,
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    });
  },

  clearTree: (projectId) => {
    const pid = projectId ?? get().activeProjectId;
    set({
      nodes: [],
      edges: [],
      generationAnchors: [],
      connectionStyles: [],
      editingAnchorIds: [],
      selectedNodeIds: [],
      primarySelectedNodeId: null,
      anchorNodeId: null,
      nodeSizesById: {},
      viewportBounds: null,
      genInheritFlashByNodeId: {},
      pendingGenChangePrompt: null,
      nameRoleSuggestions: [],
      reviewNamesModalOpen: false,
    });
    if (pid) {
      const driver = getStorageDriver();
      driver.saveProjectData(pid, {
        version: 1,
        moduleType: "familyTree",
        nodes: [],
        edges: [],
        anchorNodeId: null,
        generationAnchors: [],
        connectionStyles: [],
        ui: {
          genLabelMode: "letters",
          showGenerationAnchors: true,
          showGenInheritIndicator: true,
          snapToGrid: true,
          showNodeInfoEnabled: false,
          nodeInfoTopLeft: true,
          nodeInfoCenter: false,
          nodeInfoSize: false,
          nodeInfoSpacing: false,
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
    state.nodeInfoSpacing !== prevNodeInfoSpacing ||
    state.singleChildAlignment !== prevSingleChildAlignment ||
    state.childrenRowAlignment3Plus !== prevChildrenRowAlignment3Plus ||
    state.persistUnionSelectionOnChildCreate !== prevPersistUnionSelectionOnChildCreate ||
    state.scriptPanelLayout !== prevScriptPanelLayout ||
    state.showGenerationAnchors !== prevShowGenerationAnchors ||
    state.showGenInheritIndicator !== prevShowGenInheritIndicator ||
    state.genLabelMode !== prevGenLabelMode ||
    JSON.stringify(state.generationAnchors) !== prevGenerationAnchorsJson ||
    JSON.stringify(state.connectionStyles) !== prevConnectionStylesJson;
  prevNodes = state.nodes;
  prevEdges = state.edges;
  prevShowNodeInfoEnabled = state.showNodeInfoEnabled;
  prevNodeInfoTopLeft = state.nodeInfoTopLeft;
  prevNodeInfoCenter = state.nodeInfoCenter;
  prevNodeInfoSize = state.nodeInfoSize;
  prevNodeInfoSpacing = state.nodeInfoSpacing;
  prevSingleChildAlignment = state.singleChildAlignment;
  prevChildrenRowAlignment3Plus = state.childrenRowAlignment3Plus;
  prevPersistUnionSelectionOnChildCreate = state.persistUnionSelectionOnChildCreate;
  prevScriptPanelLayout = state.scriptPanelLayout;
  prevShowGenerationAnchors = state.showGenerationAnchors;
  prevShowGenInheritIndicator = state.showGenInheritIndicator;
  prevGenLabelMode = state.genLabelMode;
  prevGenerationAnchorsJson = JSON.stringify(state.generationAnchors);
  prevConnectionStylesJson = JSON.stringify(state.connectionStyles);
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
