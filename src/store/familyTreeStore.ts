import { create } from "zustand";
import type { Node, Edge } from "reactflow";
import { getStorageDriver, type PersistedFamilyRecord } from "../storage/StorageDriver";
import { parseFamilyTreeScript, computeBranchUnionIds } from "./familyTreeScript";
import {
  type FamilyTreeDocumentRecord,
  combineFamilyDocumentContents,
  generateDocumentDisplayContent,
  generateUnassignedReferenceContent,
  getScopeIdsForFamily,
  formatMainDocumentName,
  migrateDocumentOwnership,
  nextDocumentSuffix,
  migrateLegacyDocumentContent,
  previewFamilyDocumentDeleteCounts,
  scanDocumentDeclaredIds,
  removeDeclarationBlocks,
} from "./familyTreeDocumentHelpers";

export type { FamilyTreeDocumentRecord };

export type { PersistedFamilyRecord };

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
export const DEFAULT_CHILD_ROW_SPACING = 224;
const UNIFORM_SPACING = DEFAULT_CHILD_ROW_SPACING;

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
  /** True when canvas coordinates are not yet assigned (x: ? / y: ? in script). */
  positionUnset?: boolean;
  /** When true, this person stays fixed during union group drag and keeps custody on family transfer. */
  anchored?: boolean;
  /** Built-in gender id or a label from customGenders. */
  gender?: string;
  /** When true, the assigned gen anchor survives moves into other generation bands. */
  genAnchorLocked?: boolean;
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


function escapeScriptQuoted(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatCoordField(
  key: "x" | "y",
  value: number | undefined,
  unset: boolean | undefined,
  indent: string
): string {
  if (unset) return `${indent}${key}: ?`;
  if (value == null) return "";
  return `${indent}${key}: ${Math.round(value)}`;
}

function formatPersonBlockLines(
  n: Node<PersonNodeData>,
  opts: {
    indent: string;
    compact: boolean;
    genIndex: number | null;
    showNodeInfo: boolean;
    nodeInfoTopLeft: boolean;
    nodeInfoCenter: boolean;
    nodeInfoSize: boolean;
    getSize: (id: string, isUnion: boolean) => { w: number; h: number };
  }
): string[] {
  const { first, middle, last } = getPersonNameParts(n.data);
  const nickStr = (n.data.nicknames ?? []).map((x) => escapeScriptQuoted(x.trim())).join(", ");
  const unset = n.data.positionUnset;
  const { indent, compact } = opts;

  if (compact) {
    const parts = [
      `first: "${escapeScriptQuoted(first)}"`,
      `middle: "${escapeScriptQuoted(middle)}"`,
      `last: "${escapeScriptQuoted(last)}"`,
      `nicknames: "${nickStr}"`,
      `notes: "${escapeScriptQuoted(n.data.notes ?? "")}"`,
    ];
    if (opts.genIndex !== null) parts.push(`gen: ${opts.genIndex}`);
    if (n.data.anchored) parts.push("anchored: true");
    if (n.data.gender) parts.push(`gender: "${escapeScriptQuoted(n.data.gender)}"`);
    if (n.data.genAnchorLocked) parts.push("genLock: true");
    const xy = unset
      ? "x: ? y: ?"
      : `x: ${Math.round(n.position.x)} y: ${Math.round(n.position.y)}`;
    parts.push(xy);
    return [`Person ${n.id} { ${parts.join(" ")} }`];
  }

  const lines = [`Person ${n.id} {`];
  lines.push(`${indent}first: "${escapeScriptQuoted(first)}"`);
  lines.push(`${indent}middle: "${escapeScriptQuoted(middle)}"`);
  lines.push(`${indent}last: "${escapeScriptQuoted(last)}"`);
  lines.push(`${indent}nicknames: "${nickStr}"`);
  lines.push(`${indent}notes: "${escapeScriptQuoted(n.data.notes ?? "")}"`);
  if (opts.genIndex !== null) lines.push(`${indent}gen: ${opts.genIndex}`);
  if (n.data.anchored) lines.push(`${indent}anchored: true`);
  if (n.data.gender) lines.push(`${indent}gender: "${escapeScriptQuoted(n.data.gender)}"`);
  if (n.data.genAnchorLocked) lines.push(`${indent}genLock: true`);
  const xLine = formatCoordField("x", n.position.x, unset, indent);
  const yLine = formatCoordField("y", n.position.y, unset, indent);
  if (xLine) lines.push(xLine);
  if (yLine) lines.push(yLine);

  if (opts.showNodeInfo) {
    const { w, h } = opts.getSize(n.id, false);
    if (opts.nodeInfoCenter) {
      lines.push(`${indent}cx: ${Math.round(n.position.x + w / 2)}`);
      lines.push(`${indent}cy: ${Math.round(n.position.y + h / 2)}`);
    }
    if (opts.nodeInfoSize) {
      lines.push(`${indent}w: ${w}`);
      lines.push(`${indent}h: ${h}`);
    }
  }
  lines.push("}");
  return lines;
}

/** "forward" = parents above, children below (current). "backward" = children first, add parents above. */
export type UnionType = "forward" | "backward";

/** Toolbar-level union creation mode. "full" builds parents + children in one action. */
export type UnionCreateMode = UnionType | "full";

export interface FullUnionParentSpec { role?: string; gender?: string }
export interface FullUnionChildSpec { childRole?: string; gender?: string }

export interface FullUnionSettings {
  includeFather: boolean;
  includeMother: boolean;
  includeChildren: boolean;
  childCount: number;
  advancedEnabled: boolean;
  parents: FullUnionParentSpec[];
  children: FullUnionChildSpec[];
  autoAssignMissingPartner: boolean;
}

const DEFAULT_FULL_UNION_SETTINGS: FullUnionSettings = {
  includeFather: true,
  includeMother: true,
  includeChildren: false,
  childCount: 0,
  advancedEnabled: false,
  parents: [],
  children: [],
  autoAssignMissingPartner: true,
};

export const BUILT_IN_PARENT_ROLES = [
  "father",
  "mother",
  "unknown",
  "guardian",
  "stepmother",
  "stepfather",
  "stepparent",
  "adoptive_mother",
  "adoptive_father",
  "parent",
  "nanny",
] as const;
/** Built-in role id or a label from customParentRoles. Undefined means unassigned. */
export type ParentRole = string;

export const ROLE_GENDER_MAP: Record<string, string> = {
  father: "male",
  stepfather: "male",
  adoptive_father: "male",
  mother: "female",
  stepmother: "female",
  adoptive_mother: "female",
  parent: "other",
};

export function genderForParentRole(role: string | null | undefined): string | null {
  if (!role) return null;
  return ROLE_GENDER_MAP[role.toLowerCase()] ?? null;
}

export const BUILT_IN_GENDERS = ["male", "female", "other"] as const;

export const BUILT_IN_CHILD_ROLES = [
  "son",
  "daughter",
  "child",
  "adoptive_son",
  "adoptive_daughter",
  "adoptive_child",
] as const;
/** Built-in role id or a label from customChildRoles. Undefined means unassigned. */
export type ChildRole = string;

export interface ConnectionIconRef {
  kind: "emoji" | "icon";
  value: string;
}

export interface ConnectionVisualStyle {
  stroke: string;
  strokeWidth: number;
  dashPattern: number[];
  description?: string;
  icon?: ConnectionIconRef;
}

export const FAMILY_COLOR_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
] as const;

export function getFamilyColor(familyIndex: number): string {
  return FAMILY_COLOR_PALETTE[familyIndex % FAMILY_COLOR_PALETTE.length]!;
}

export function getEffectiveFamilyColor(family: FamilyGroup, familyIndex: number): string {
  return family.color ?? getFamilyColor(familyIndex);
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

/** Resolve the display name for a union's connection style. */
export function getConnectionStyleName(
  data: Pick<UnionNodeData, "connectionStyleId" | "connectionStyleOverride">,
  connectionStyles: ConnectionStyleDef[]
): string {
  if (data.connectionStyleOverride) return "Custom";
  if (data.connectionStyleId) {
    const found = connectionStyles.find((s) => s.id === data.connectionStyleId);
    if (found) return found.name;
  }
  return "Default";
}

export interface FamilyTreeEdgeData {
  type: "partner" | "child";
  /** Per union-child edge role (son, daughter, adoptive_son, custom label, etc.). */
  childRole?: string;
  connectionStyleId?: string;
  connectionStyleOverride?: ConnectionVisualStyle;
}

/** Resolve visual style for a single edge, falling back to its union's default style. */
export function resolveEdgeConnectionStyle(
  edge: Edge,
  unionData: UnionNodeData,
  connectionStyles: ConnectionStyleDef[]
): ConnectionVisualStyle {
  const edgeData = edge.data as FamilyTreeEdgeData | undefined;
  if (edgeData?.connectionStyleOverride) return edgeData.connectionStyleOverride;
  if (edgeData?.connectionStyleId) {
    const found = connectionStyles.find((s) => s.id === edgeData.connectionStyleId);
    if (found) return found;
  }
  return resolveUnionConnectionStyle(unionData, connectionStyles);
}

/** Resolve display name for a single edge's connection style. */
export function getEdgeConnectionStyleName(
  edge: Edge,
  unionData: UnionNodeData,
  connectionStyles: ConnectionStyleDef[]
): string {
  const edgeData = edge.data as FamilyTreeEdgeData | undefined;
  if (edgeData?.connectionStyleOverride) return "Custom";
  if (edgeData?.connectionStyleId) {
    const found = connectionStyles.find((s) => s.id === edgeData.connectionStyleId);
    if (found) return found.name;
  }
  return getConnectionStyleName(unionData, connectionStyles);
}

/** Find the partner or child edge connecting a person to a union. */
export function getEdgeForPersonAtUnion(
  unionId: string,
  personId: string,
  edges: Edge[]
): Edge | undefined {
  const partner = edges.find(
    (e) =>
      (e.data as FamilyTreeEdgeData)?.type === "partner" &&
      e.target === unionId &&
      e.source === personId
  );
  if (partner) return partner;
  return edges.find(
    (e) =>
      (e.data as FamilyTreeEdgeData)?.type === "child" &&
      e.source === unionId &&
      e.target === personId
  );
}

export interface UnionPartnerSlot {
  personId: string;
  role?: ParentRole;
}

export function getUnionPartners(data: UnionNodeData): UnionPartnerSlot[] {
  if (data.partners && data.partners.length > 0) {
    return data.partners.map((p) => ({ personId: p.personId, role: p.role }));
  }
  const result: UnionPartnerSlot[] = [];
  const leftId = data.leftPartnerId ?? data.partnerIds?.[0];
  const rightId = data.rightPartnerId ?? data.partnerIds?.[1];
  if (leftId) result.push({ personId: leftId, role: data.leftPartnerRole });
  if (rightId && rightId !== leftId) result.push({ personId: rightId, role: data.rightPartnerRole });
  // Also include any extra ids from partnerIds beyond left/right (legacy safety)
  const seen = new Set(result.map((p) => p.personId));
  for (const id of data.partnerIds ?? []) {
    if (id && !seen.has(id)) {
      result.push({ personId: id });
      seen.add(id);
    }
  }
  return result;
}

export function withUnionPartners(data: UnionNodeData, partners: UnionPartnerSlot[]): UnionNodeData {
  const p0 = partners[0];
  const p1 = partners[1];
  return {
    ...data,
    partners: partners.map((p) => ({ personId: p.personId, ...(p.role ? { role: p.role } : {}) })),
    partnerIds: [p0?.personId ?? null, p1?.personId ?? null],
    leftPartnerId: p0?.personId,
    rightPartnerId: p1?.personId,
    leftPartnerRole: p0?.role,
    rightPartnerRole: p1?.role,
  };
}

export function resolveUnionPartnerNodes(
  unionId: string,
  nodes: Node<FamilyTreeNodeData>[]
): Node<PersonNodeData>[] {
  const unionNode = nodes.find(
    (n) => n.id === unionId && (n.data as { kind?: string }).kind === "union"
  );
  if (!unionNode) return [];
  const partners = getUnionPartners(unionNode.data as UnionNodeData);
  const personById = new Map(
    nodes.filter((n) => (n.data as { kind?: string }).kind === "person").map((n) => [n.id, n])
  );
  return partners
    .map((p) => personById.get(p.personId))
    .filter((n): n is Node<PersonNodeData> => n != null);
}

export interface UnionNodeData {
  kind: "union";
  /** Display name (e.g. "Union 1"); editable in Inspector and persisted in script. */
  name?: string;
  partnerIds: [string | null, string | null]; // Parent IDs; null = slot not yet filled (backward union in progress)
  leftPartnerId?: string;
  rightPartnerId?: string;
  leftPartnerRole?: ParentRole;
  rightPartnerRole?: ParentRole;
  partners?: UnionPartnerSlot[];
  /** When true, swap which handle each partner connects to (left↔right) to reduce edge crossings. */
  partnerHandleSwap?: boolean;
  notes: string;
  unionType?: UnionType; // Default "forward" for legacy
  connectionStyleId?: string;
  connectionStyleOverride?: ConnectionVisualStyle;
  /** When true, dragging any partner/child of this union moves the whole family group together. */
  familyLocked?: boolean;
  /** When true, this union anchors the main family graph for its family tab. */
  isMainGraph?: boolean;
  /** Per-union arrange overrides: horizontal/vertical spacing and parent alignment relative to child row. */
  arrangeSpacing?: UnionArrangeSpacing;
  /** Creation timestamp for stable family auto-numbering order. */
  createdAt?: number;
  /** True when canvas coordinates are not yet assigned (x: ? / y: ? in script). */
  positionUnset?: boolean;
}

export type UnionArrangeSpacing = {
  parentSpacing?: number;
  childSpacing?: number;
  verticalSpacing?: number;
  parentAlignment?: "left" | "center" | "right";
};

export type UnionArrangeSpacingPatch = Partial<UnionArrangeSpacing>;

export type FamilyTreeNodeData = PersonNodeData | UnionNodeData;

export interface CustomFamilyNameRecord {
  unionIds: string[];
  name: string;
  description?: string;
}

/** Persisted family tab — union membership is frozen until explicitly changed. */
export interface FamilyGroup extends PersistedFamilyRecord {
  memberPersonIds: string[];
}

export type BranchMode = "hidden" | "tab";

/** Persisted branch — downward subtree from a root person. */
export interface BranchRecord {
  id: string;
  name: string;
  description: string;
  mode: BranchMode;
  rootPersonId: string;
  familyId: string | null;
  createdAt: number;
}

export type RemoveConnectionTarget =
  | { kind: "union"; unionId: string }
  | { kind: "partnerEdge"; unionId: string; personId: string }
  | { kind: "childEdge"; unionId: string; personId: string }
  | { kind: "person"; personId: string };

export type PendingBloodlineWarning = {
  target: RemoveConnectionTarget;
  familyId: string;
  familyName: string;
  crownedComponentUnionIds: string[];
};

export type PendingDeleteConfirm =
  | { kind: "family"; familyId: string }
  | { kind: "nodes"; nodeIds: string[] };

export type PendingAnchorTransferWarning = {
  nodeId: string;
  position: { x: number; y: number };
  sourceFamilyId: string;
  targetFamilyId: string;
  reducedUnionIds: string[];
};

export interface FamilyTreeSavedState {
  nodes: Node<FamilyTreeNodeData>[];
  edges: Edge[];
  generationAnchors?: GenerationAnchor[];
  connectionStyles?: ConnectionStyleDef[];
  /** @deprecated Legacy migration source. */
  customFamilyNames?: CustomFamilyNameRecord[];
  families?: PersistedFamilyRecord[];
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
    showGenerationAnchors?: boolean;
    showGenInheritIndicator?: boolean;
    genAnchorBandOpacity?: number;
    genAnchorLineOpacity?: number;
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

/** Replace legacy Unknown / Unknown N / ??? in person node fields with "?". */
function normalizeUnknownNames(nodes: Node<FamilyTreeNodeData>[]): Node<FamilyTreeNodeData>[] {
  const isUnknownOrUnknownN = (s: string | undefined | null) =>
    isUnknownPlaceholder(s) || /^Unknown \d+$/.test((s ?? "").trim());
  const result = nodes.map((n) => {
    if (n.data?.kind !== "person") return n;
    const d = n.data as PersonNodeData;
    const hasRepl =
      isUnknownOrUnknownN(d.name) ||
      isUnknownOrUnknownN(d.firstName) ||
      isUnknownOrUnknownN(d.middleName) ||
      isUnknownOrUnknownN(d.lastName) ||
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
  const partnerIds = getUnionPartners(data).map((p) => p.personId);
  const childIds = edges.filter((e) => e.source === unionId && isChildEdge(e)).map((e) => e.target);
  return Array.from(new Set([...partnerIds, ...childIds]));
}

export function resolveUnionPartners(
  unionId: string,
  nodes: Node<FamilyTreeNodeData>[]
): {
  leftId: string;
  rightId: string;
  leftNode: Node<PersonNodeData>;
  rightNode: Node<PersonNodeData>;
  unionData: UnionNodeData;
} | null {
  const unionNode = nodes.find(
    (n) => n.id === unionId && (n.data as { kind?: string }).kind === "union"
  );
  if (!unionNode) return null;
  const unionData = unionNode.data as UnionNodeData;
  const partnerIds = unionData.partnerIds;
  if (!partnerIds || partnerIds.length !== 2) return null;

  const personById = new Map(
    nodes.filter((n) => (n.data as { kind?: string }).kind === "person").map((n) => [n.id, n])
  );
  const parents = partnerIds
    .map((id) => (id != null ? personById.get(id) : undefined))
    .filter((n): n is Node<PersonNodeData> => n != null);
  if (parents.length !== 2) return null;
  const [p0, p1] = parents;

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
  if (!leftNode || !rightNode) return null;
  return {
    leftId,
    rightId,
    leftNode: leftNode as Node<PersonNodeData>,
    rightNode: rightNode as Node<PersonNodeData>,
    unionData,
  };
}

/** Direct children of a union, sorted left-to-right by current X. */
export function getUnionDirectChildren(
  unionId: string,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): Node<PersonNodeData>[] {
  const personById = new Map(
    nodes.filter((n) => (n.data as { kind?: string }).kind === "person").map((n) => [n.id, n])
  );
  return edges
    .filter((e) => e.source === unionId && isChildEdge(e))
    .map((e) => e.target)
    .filter((id) => personById.has(id))
    .map((id) => personById.get(id)! as Node<PersonNodeData>)
    .sort((a, b) => a.position.x - b.position.x);
}

export function getUnionParentGap(
  unionId: string,
  nodes: Node<FamilyTreeNodeData>[]
): number | null {
  const partners = resolveUnionPartnerNodes(unionId, nodes);
  if (partners.length < 2) return null;
  return Math.abs(partners[1]!.position.x - partners[0]!.position.x);
}

export function getUnionChildrenAvgGap(
  unionId: string,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): number | null {
  const children = getUnionDirectChildren(unionId, nodes, edges);
  if (children.length < 2) return null;
  let total = 0;
  for (let i = 1; i < children.length; i++) {
    total += children[i].position.x - children[i - 1]!.position.x;
  }
  return total / (children.length - 1);
}

export function getUnionVerticalGap(
  unionId: string,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): number | null {
  const partners = resolveUnionPartnerNodes(unionId, nodes);
  if (partners.length === 0) return null;
  const children = getUnionDirectChildren(unionId, nodes, edges);
  if (children.length === 0) return null;
  const avgParentY = partners.reduce((s, p) => s + p.position.y, 0) / partners.length;
  const avgChildY = children.reduce((s, c) => s + c.position.y, 0) / children.length;
  return avgChildY - avgParentY;
}

export function getUnionChildRowSpan(
  unionId: string,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[],
  nodeSizesById: Record<string, { width: number; height: number }>
): { left: number; right: number } | null {
  const children = getUnionDirectChildren(unionId, nodes, edges);
  if (children.length === 0) return null;
  const getW = (id: string) => nodeSizesById[id]?.width ?? DEFAULT_PERSON_W;
  const left = Math.min(...children.map((c) => c.position.x));
  const right = Math.max(...children.map((c) => c.position.x + getW(c.id)));
  return { left, right };
}

/** True if person is target of any child edge (i.e. has parents / is already a child). */
export function hasParents(edges: Edge[], personId: string): boolean {
  return edges.some((e) => isChildEdge(e) && e.target === personId);
}

/** Partner edges use edge.data.type === 'partner'. */
export function isPartnerEdge(edge: Edge): boolean {
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

export interface FamilyComponent {
  unionIds: string[];
}

function unionIdsKey(ids: string[]): string {
  return [...ids].sort().join("\0");
}

function setsOverlap(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  return a.some((id) => setB.has(id));
}

/** Connected components of unions linked transitively via shared people. */
export function computeFamilyComponents(
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): FamilyComponent[] {
  const unionNodes = nodes.filter(
    (n) => n.type === "union" && (n.data as UnionNodeData).kind === "union"
  );
  const unionIds = unionNodes.map((n) => n.id);
  if (unionIds.length === 0) return [];

  const parent = new Map<string, string>();
  for (const id of unionIds) parent.set(id, id);

  const find = (x: string): string => {
    let p = parent.get(x)!;
    while (true) {
      const pp = parent.get(p)!;
      if (p === pp) break;
      parent.set(p, parent.get(pp)!);
      p = parent.get(p)!;
    }
    parent.set(x, p);
    return p;
  };

  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const personNodes = nodes.filter((n) => (n.data as PersonNodeData).kind === "person");
  for (const person of personNodes) {
    const personUnionIds = Array.from(getUnionIdsForPerson(person.id, edges));
    for (let i = 1; i < personUnionIds.length; i++) {
      union(personUnionIds[0]!, personUnionIds[i]!);
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of unionIds) {
    const root = find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }

  return Array.from(groups.values()).map((ids) => ({
    unionIds: [...ids].sort(),
  }));
}

/** All person ids belonging to a family (union members across all unions in the component). */
export function getFamilyMemberPersonIds(
  unionIds: string[],
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): string[] {
  const ids = new Set<string>();
  for (const unionId of unionIds) {
    for (const personId of getUnionFamilyMemberIds(unionId, nodes, edges)) {
      ids.add(personId);
    }
  }
  return Array.from(ids);
}

/** Union IDs where this person is a partner (parent role), not child. */
export function getParentUnionIdsForPerson(personId: string, edges: Edge[]): string[] {
  return edges
    .filter((e) => isPartnerEdge(e) && e.source === personId)
    .map((e) => e.target);
}

/**
 * All person + union ids in the downward subtree below rootPersonId.
 * Unions where root is a parent, their other partners, children, and recursive descendants.
 * Excludes rootPersonId itself.
 */
export function computeBranchMemberIds(
  rootPersonId: string,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): string[] {
  const result = new Set<string>();

  const addDownwardFromPerson = (personId: string) => {
    for (const unionId of getParentUnionIdsForPerson(personId, edges)) {
      if (result.has(unionId)) continue;
      result.add(unionId);

      const unionNode = nodes.find((n) => n.id === unionId);
      if (unionNode) {
        const d = unionNode.data as UnionNodeData;
        const partnerIds = [d.leftPartnerId, d.rightPartnerId, ...(d.partnerIds ?? [])].filter(
          (pid): pid is string => pid != null && pid !== personId
        );
        for (const pid of partnerIds) {
          if (!result.has(pid)) {
            result.add(pid);
            addDownwardFromPerson(pid);
          }
        }
      }

      const childIds = edges
        .filter((e) => e.source === unionId && isChildEdge(e))
        .map((e) => e.target);
      for (const childId of childIds) {
        if (!result.has(childId)) {
          result.add(childId);
          addDownwardFromPerson(childId);
        }
      }
    }
  };

  addDownwardFromPerson(rootPersonId);
  return Array.from(result);
}

export function canBranchFromPerson(
  personId: string,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): boolean {
  return computeBranchMemberIds(personId, nodes, edges).length > 0;
}

/** Union of all branch member ids (hidden + tab) for canvas exclusion on main view. */
export function getBranchExcludedNodeIds(
  branches: BranchRecord[],
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): Set<string> {
  const excluded = new Set<string>();
  for (const b of branches) {
    for (const id of computeBranchMemberIds(b.rootPersonId, nodes, edges)) {
      excluded.add(id);
    }
  }
  return excluded;
}

function findFamilyIdForPerson(
  personId: string,
  families: FamilyGroup[],
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): string | null {
  for (const f of families) {
    const members = f.memberPersonIds.length
      ? f.memberPersonIds
      : getFamilyMemberPersonIds(f.unionIds, nodes, edges);
    if (members.includes(personId)) return f.id;
  }
  return null;
}

/** Union nodes + member person nodes for canvas/script filtering. */
export function getFamilyMemberNodeIds(
  unionIds: string[],
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): string[] {
  return [...unionIds, ...getFamilyMemberPersonIds(unionIds, nodes, edges)];
}

/** All node ids visible for a family tab (unions, union members, and explicit personIds). */
export function getFamilyVisibleNodeIds(
  family: FamilyGroup,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): string[] {
  const ids = new Set(getFamilyMemberNodeIds(family.unionIds, nodes, edges));
  for (const pid of family.personIds ?? []) {
    ids.add(pid);
  }
  return Array.from(ids);
}

/** Find the family tab that owns a node (union or person). */
export function findFamilyForNode(
  nodeId: string,
  families: FamilyGroup[]
): FamilyGroup | null {
  for (const f of families) {
    if (f.unionIds.includes(nodeId)) return f;
    if ((f.personIds ?? []).includes(nodeId)) return f;
    if (f.memberPersonIds.includes(nodeId)) return f;
  }
  return null;
}

/** Node ids owned by a family other than the active family tab. Empty when no tab is active. */
export function computeOutOfActiveFamilyIds(
  nodes: Node<FamilyTreeNodeData>[],
  families: FamilyGroup[],
  activeFamilyTabId: string | null
): Set<string> {
  if (activeFamilyTabId == null) return new Set();
  const ids = new Set<string>();
  for (const n of nodes) {
    const owner = findFamilyForNode(n.id, families);
    if (owner != null && owner.id !== activeFamilyTabId) {
      ids.add(n.id);
    }
  }
  return ids;
}

export function getUnionCreatedAt(unionId: string, nodes: Node<FamilyTreeNodeData>[]): number {
  const idx = nodes.findIndex((n) => n.id === unionId);
  if (idx < 0) return 0;
  const data = nodes[idx]!.data as UnionNodeData;
  if (data.createdAt != null) return data.createdAt;
  return idx;
}

function getEarliestUnionCreatedAt(unionIds: string[], nodes: Node<FamilyTreeNodeData>[]): number {
  if (unionIds.length === 0) return 0;
  return Math.min(...unionIds.map((id) => getUnionCreatedAt(id, nodes)));
}

const generateFamilyId = () => `fam_${Math.random().toString(36).slice(2, 11)}`;
const generateBranchId = () => `br_${Math.random().toString(36).slice(2, 11)}`;

function branchesToPersisted(branches: BranchRecord[]): BranchRecord[] {
  return branches.map((b) => ({ ...b }));
}

function toFamilyGroup(
  record: PersistedFamilyRecord,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): FamilyGroup {
  const explicit = [...(record.personIds ?? [])].sort();
  const fromUnions = getFamilyMemberPersonIds(record.unionIds, nodes, edges);
  return {
    ...record,
    personIds: explicit,
    unionIds: [...record.unionIds].sort(),
    memberPersonIds: Array.from(new Set([...explicit, ...fromUnions])),
  };
}

function familiesToPersisted(families: FamilyGroup[]): PersistedFamilyRecord[] {
  return families.map(({ memberPersonIds: _mp, ...rest }) => ({
    ...rest,
    unionIds: [...rest.unionIds].sort(),
  }));
}

/** Connected components restricted to a subset of union ids. */
function computeComponentsForUnionSubset(
  unionIds: string[],
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): string[][] {
  const allowed = new Set(unionIds);
  if (allowed.size === 0) return [];

  const parent = new Map<string, string>();
  for (const id of allowed) parent.set(id, id);

  const find = (x: string): string => {
    let p = parent.get(x)!;
    while (true) {
      const pp = parent.get(p)!;
      if (p === pp) break;
      parent.set(p, parent.get(pp)!);
      p = parent.get(p)!;
    }
    parent.set(x, p);
    return p;
  };

  const unionFn = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const personNodes = nodes.filter((n) => (n.data as PersonNodeData).kind === "person");
  for (const person of personNodes) {
    const personUnionIds = Array.from(getUnionIdsForPerson(person.id, edges)).filter((id) =>
      allowed.has(id)
    );
    for (let i = 1; i < personUnionIds.length; i++) {
      unionFn(personUnionIds[0]!, personUnionIds[i]!);
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of allowed) {
    const root = find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }
  return Array.from(groups.values()).map((ids) => [...ids].sort());
}

export interface FamilyClusterAnalysis {
  assignedUnionIds: string[];
  unassignedUnionIds: string[];
  unionlessPersonIds: string[];
}

/** Within a family tab, which unions form the main connected cluster vs unassigned fragments. */
export function computeFamilyClusterAnalysis(
  family: FamilyGroup,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): FamilyClusterAnalysis {
  const familyUnionIds = family.unionIds.filter((uid) => nodes.some((n) => n.id === uid));
  const unionlessPersonIds = getUnionlessPersonIdsInFamily(family, nodes, edges);

  if (familyUnionIds.length === 0) {
    return { assignedUnionIds: [], unassignedUnionIds: [], unionlessPersonIds };
  }

  const crownedId = familyUnionIds.find(
    (uid) => (nodes.find((n) => n.id === uid)?.data as UnionNodeData)?.isMainGraph
  );
  if (!crownedId) {
    return {
      assignedUnionIds: [],
      unassignedUnionIds: [...familyUnionIds],
      unionlessPersonIds,
    };
  }

  const components = computeComponentsForUnionSubset(familyUnionIds, nodes, edges);
  const main = components.find((c) => c.includes(crownedId)) ?? [crownedId];
  return {
    assignedUnionIds: [...main],
    unassignedUnionIds: familyUnionIds.filter((uid) => !main.includes(uid)),
    unionlessPersonIds,
  };
}

function getUnionlessPersonIdsInFamily(
  family: FamilyGroup,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): string[] {
  const result: string[] = [];
  for (const pid of family.memberPersonIds) {
    const node = nodes.find((n) => n.id === pid);
    if (!node || (node.data as PersonNodeData).kind !== "person") continue;
    const linked = edges.some(
      (e) =>
        (isPartnerEdge(e) && (e.source === pid || e.target === pid)) ||
        (isChildEdge(e) && (e.source === pid || e.target === pid))
    );
    if (!linked) result.push(pid);
  }
  return result;
}

/** True when a union is in an unassigned cluster within its family tab. */
export function isUnionClusterUnassigned(
  unionId: string,
  family: FamilyGroup,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): boolean {
  if (!family.unionIds.includes(unionId)) return false;
  const analysis = computeFamilyClusterAnalysis(family, nodes, edges);
  return analysis.unassignedUnionIds.includes(unionId);
}

/** All union ids in the same unassigned connected component as the given union. */
export function getUnassignedClusterUnionIds(
  unionId: string,
  family: FamilyGroup,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): string[] {
  const analysis = computeFamilyClusterAnalysis(family, nodes, edges);
  const components = computeComponentsForUnionSubset(analysis.unassignedUnionIds, nodes, edges);
  return components.find((c) => c.includes(unionId)) ?? [unionId];
}

interface UnionTransferSets {
  filteredUnionIds: string[];
  stayingUnions: string[];
  movingPersons: Set<string>;
  movingNodeIds: Set<string>;
  stayingNodeIds: Set<string>;
  newEdges: Edge[];
  nextNodes: Node<FamilyTreeNodeData>[];
}

function applyUnionPartnerFixups(
  nodes: Node<FamilyTreeNodeData>[],
  movingNodeIds: Set<string>,
  stayingNodeIds: Set<string>
): Node<FamilyTreeNodeData>[] {
  return nodes.map((n) => {
    if (n.type !== "union" || (n.data as UnionNodeData).kind !== "union") return n;
    const data = n.data as UnionNodeData;
    const unionIsMoving = movingNodeIds.has(n.id);
    const unionIsStaying = stayingNodeIds.has(n.id);
    if (!unionIsMoving && !unionIsStaying) return n;

    const shouldClearPartner = (pid: string | undefined): boolean => {
      if (!pid) return false;
      const partnerMoving = movingNodeIds.has(pid);
      const partnerStaying = stayingNodeIds.has(pid);
      if (unionIsStaying && partnerMoving) return true;
      if (unionIsMoving && partnerStaying) return true;
      return false;
    };

    const partners = getUnionPartners(data);
    const newPartners = partners.filter((p) => !shouldClearPartner(p.personId));
    if (newPartners.length === partners.length) return n;
    return {
      ...n,
      data: withUnionPartners(data, newPartners),
    };
  });
}

function computeUnionTransferSets(
  unionIds: string[],
  sourceFamily: FamilyGroup,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[],
  restrictPersonIds?: Set<string> | null
): UnionTransferSets | null {
  const filteredUnionIds = unionIds.filter((uid) => {
    const n = nodes.find((nn) => nn.id === uid);
    return !(n?.data as UnionNodeData)?.isMainGraph;
  });
  if (filteredUnionIds.length === 0) return null;

  const movingUnions = new Set(filteredUnionIds);
  const stayingUnions = sourceFamily.unionIds.filter((uid) => !movingUnions.has(uid));
  const movingPersons = new Set<string>();
  for (const uid of filteredUnionIds) {
    for (const pid of getUnionFamilyMemberIds(uid, nodes, edges)) {
      const person = nodes.find((n) => n.id === pid);
      const anchored = (person?.data as PersonNodeData)?.anchored;
      if (anchored) continue;
      if (restrictPersonIds && !restrictPersonIds.has(pid)) continue;
      movingPersons.add(pid);
    }
  }
  const movingNodeIds = new Set<string>([...filteredUnionIds, ...movingPersons]);
  const stayingNodeIds = new Set<string>([...stayingUnions]);
  for (const suid of stayingUnions) {
    for (const pid of getUnionFamilyMemberIds(suid, nodes, edges)) {
      if (!movingPersons.has(pid)) stayingNodeIds.add(pid);
    }
  }
  for (const pid of sourceFamily.personIds ?? []) {
    if (!movingPersons.has(pid)) stayingNodeIds.add(pid);
  }
  const newEdges = edges.filter((e) => {
    const touchesMoving = movingNodeIds.has(e.source) || movingNodeIds.has(e.target);
    const touchesStaying = stayingNodeIds.has(e.source) || stayingNodeIds.has(e.target);
    return !(touchesMoving && touchesStaying);
  });
  const nextNodes = applyUnionPartnerFixups(nodes, movingNodeIds, stayingNodeIds);

  return {
    filteredUnionIds,
    stayingUnions,
    movingPersons,
    movingNodeIds,
    stayingNodeIds,
    newEdges,
    nextNodes,
  };
}

/** Unions that cannot transfer because they contain an anchored person (partner union + descendants). */
export function computeAnchorBlockedUnionIds(
  unionIds: string[],
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): { blockedUnionIds: string[]; reducedUnionIds: string[] } {
  const candidateSet = new Set(unionIds);
  const blocked = new Set<string>();
  for (const uid of unionIds) {
    for (const pid of getUnionFamilyMemberIds(uid, nodes, edges)) {
      const person = nodes.find((n) => n.id === pid);
      if (!(person?.data as PersonNodeData)?.anchored) continue;
      for (const e of edges) {
        if (isChildEdge(e) && e.target === pid && candidateSet.has(e.source)) {
          blocked.add(e.source);
        }
      }
      for (const branchId of computeBranchMemberIds(pid, nodes, edges)) {
        if (candidateSet.has(branchId) && nodes.find((n) => n.id === branchId)?.type === "union") {
          blocked.add(branchId);
        }
      }
    }
  }
  return {
    blockedUnionIds: [...blocked],
    reducedUnionIds: unionIds.filter((id) => !blocked.has(id)),
  };
}

function assignAutoFamilyNames(families: FamilyGroup[], nodes: Node<FamilyTreeNodeData>[]): void {
  const usedNames = new Set(families.filter((f) => f.name).map((f) => f.name));
  const unnamed = families.filter((f) => !f.isCustomName && !f.name);
  unnamed.sort(
    (a, b) => getEarliestUnionCreatedAt(a.unionIds, nodes) - getEarliestUnionCreatedAt(b.unionIds, nodes)
  );
  let counter = 1;
  for (const f of unnamed) {
    while (usedNames.has(`Family ${counter}`)) counter++;
    f.name = `Family ${counter++}`;
    usedNames.add(f.name);
  }
}

function createNewFamilyRecord(
  unionIds: string[] = [],
  personIds: string[] = [],
  explicit = false
): PersistedFamilyRecord {
  return {
    id: generateFamilyId(),
    unionIds: [...unionIds].sort(),
    personIds: [...personIds].sort(),
    explicit: explicit || undefined,
    name: "",
    isCustomName: false,
    description: "",
  };
}

function migrateLegacyFamilies(
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[],
  customFamilyNames: CustomFamilyNameRecord[]
): PersistedFamilyRecord[] {
  const components = computeFamilyComponents(nodes, edges);
  const records: PersistedFamilyRecord[] = [];

  for (const component of components) {
    const id = unionIdsKey(component.unionIds);
    const matchingRecords = customFamilyNames.filter((r) => setsOverlap(r.unionIds, component.unionIds));

    let name = "";
    let isCustomName = false;
    let description = "";

    if (matchingRecords.length === 1) {
      const record = matchingRecords[0]!;
      if (
        unionIdsKey(record.unionIds) === id ||
        record.unionIds.every((uid) => component.unionIds.includes(uid))
      ) {
        name = record.name;
        isCustomName = true;
        description = record.description ?? "";
      }
    }

    records.push({
      id: generateFamilyId(),
      unionIds: component.unionIds,
      name,
      isCustomName,
      description,
    });
  }

  const asGroups = records.map((r) => toFamilyGroup(r, nodes, edges));
  assignAutoFamilyNames(asGroups, nodes);
  return asGroups.map(({ memberPersonIds: _mp, ...rest }) => rest);
}

function getUnionIdsFromTarget(target: RemoveConnectionTarget, edges: Edge[]): string[] {
  switch (target.kind) {
    case "union":
      return [target.unionId];
    case "partnerEdge":
    case "childEdge":
      return [target.unionId];
    case "person":
      return Array.from(getUnionIdsForPerson(target.personId, edges));
  }
}

function simulateRemoval(
  target: RemoveConnectionTarget,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): { nodes: Node<FamilyTreeNodeData>[]; edges: Edge[] } {
  switch (target.kind) {
    case "union": {
      const ids = new Set([target.unionId]);
      return {
        nodes: nodes.filter((n) => !ids.has(n.id)),
        edges: edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
      };
    }
    case "person": {
      const ids = new Set([target.personId]);
      return {
        nodes: nodes.filter((n) => !ids.has(n.id)),
        edges: edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
      };
    }
    case "partnerEdge": {
      const unionNode = nodes.find((n) => n.id === target.unionId);
      if (!unionNode) return { nodes, edges };
      const data = unionNode.data as UnionNodeData;
      const partners = getUnionPartners(data);
      const partnerIndex = partners.findIndex((p) => p.personId === target.personId);
      if (partnerIndex === -1) return { nodes, edges };
      const newPartners = partners.filter((_, i) => i !== partnerIndex);
      const newData = withUnionPartners(data, newPartners);
      const newNodes = nodes.map((n) =>
        n.id === target.unionId ? { ...n, data: newData } : n
      );
      const newEdges = edges.filter(
        (e) =>
          !(
            (e.data as { type?: string })?.type === "partner" &&
            e.source === target.personId &&
            e.target === target.unionId
          )
      );
      return { nodes: newNodes, edges: newEdges };
    }
    case "childEdge": {
      const newEdges = edges.filter(
        (e) =>
          !(
            (e.data as { type?: string })?.type === "child" &&
            e.source === target.unionId &&
            e.target === target.personId
          )
      );
      return { nodes, edges: newEdges };
    }
  }
}

function applyRemoveConnectionInternal(
  get: () => FamilyTreeStore,
  target: RemoveConnectionTarget
): string | null {
  switch (target.kind) {
    case "union":
      get().removeNodes([target.unionId]);
      return null;
    case "person":
      get().removeNodes([target.personId]);
      return null;
    case "partnerEdge":
      return get().removePartnerFromUnion(target.unionId, target.personId);
    case "childEdge":
      return get().removeChildFromUnion(target.unionId, target.personId);
  }
}

function stripUnifiedFamilyOverlap(
  families: FamilyGroup[],
  familyId: string,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): FamilyGroup[] {
  const family = families.find((f) => f.id === familyId);
  if (!family?.parentFamilyIds) return families;

  const [parentAId, parentBId] = family.parentFamilyIds;
  const parentA = families.find((f) => f.id === parentAId);
  const parentB = families.find((f) => f.id === parentBId);
  const parentUnionIds = new Set([...(parentA?.unionIds ?? []), ...(parentB?.unionIds ?? [])]);
  const remainingUnionIds = family.unionIds.filter((uid) => !parentUnionIds.has(uid));

  return families.map((f) =>
    f.id === familyId
      ? toFamilyGroup(
          {
            ...f,
            unionIds: remainingUnionIds,
          },
          nodes,
          edges
        )
      : f
  );
}

function showFamilyConnectionNotice(
  set: (partial: Partial<FamilyTreeStore> | ((s: FamilyTreeStore) => Partial<FamilyTreeStore>)) => void,
  message: string
) {
  set({ familyConnectionNotice: message });
  setTimeout(() => {
    const current = useFamilyTreeStore.getState().familyConnectionNotice;
    if (current === message) {
      useFamilyTreeStore.setState({ familyConnectionNotice: null });
    }
  }, 3000);
}

/** Suggestion from the name/role analysis engine. Exposed for consent UI. */
export interface NameRoleSuggestion {
  nodeId: string;
  field:
    | "firstName"
    | "role"
    | "unionHealth"
    | "genConflict"
    | "unassigned"
    | "noGen"
    | "mainGraph"
    | "unassignedRole"
    | "noGender";
  currentValue: string;
  proposedValue: string;
  reason: string;
  /** For role suggestions: which union and slot to update. */
  unionId?: string;
  slot?: "left" | "right";
  partnerIndex?: number;
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
  _edges: Edge[]
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

  /** Get person's role from any union they're in. */
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

  for (const n of personById.values()) {
    const d = n.data as PersonNodeData;
    const firstName = (d.firstName ?? "").trim();
    const lastName = (d.lastName ?? "").trim();
    const lastNameFilled = !!lastName && !isUnknownPlaceholder(lastName);
    const firstNameEmptyOrUnknown = !firstName || isUnknownPlaceholder(firstName);

    // Mr./Mrs. suggestion: last name filled, first name empty or ?
    if (lastNameFilled && firstNameEmptyOrUnknown) {
      const role = getPersonRole(n.id);
      if (role === "father" || role === "stepfather") {
        suggestions.push({
          nodeId: n.id,
          field: "firstName",
          currentValue: firstName || "(empty)",
          proposedValue: "Mr.",
          reason: "Father → Mr.",
        });
      } else if (role === "mother" || role === "stepmother") {
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
  }

  return suggestions;
}

/** Flag union partner slots with no role assigned. */
export function analyzeUnassignedRoleSuggestions(
  nodes: Node<FamilyTreeNodeData>[]
): NameRoleSuggestion[] {
  const suggestions: NameRoleSuggestion[] = [];
  const unionNodes = nodes.filter(
    (n): n is Node<UnionNodeData> =>
      n.type === "union" && (n.data as UnionNodeData).kind === "union"
  );

  for (const u of unionNodes) {
    const d = u.data as UnionNodeData;
    const unionName = d.name ?? u.id;
    const partners = getUnionPartners(d);
    for (let partnerIndex = 0; partnerIndex < partners.length; partnerIndex += 1) {
      const p = partners[partnerIndex]!;
      if (!p.role) {
        suggestions.push({
          nodeId: p.personId,
          field: "unassignedRole",
          currentValue: "",
          proposedValue: "—",
          reason: `Parent role unassigned in ${unionName}`,
          unionId: u.id,
          slot: partnerIndex === 0 ? "left" : partnerIndex === 1 ? "right" : undefined,
          partnerIndex,
        });
      }
    }
  }

  return suggestions;
}

/** Flag persons with no gender assigned. */
export function analyzeNoGenderSuggestions(
  nodes: Node<FamilyTreeNodeData>[]
): NameRoleSuggestion[] {
  const suggestions: NameRoleSuggestion[] = [];
  for (const n of nodes) {
    if (n.data.kind !== "person") continue;
    const d = n.data as PersonNodeData;
    if (d.gender) continue;
    suggestions.push({
      nodeId: n.id,
      field: "noGender",
      currentValue: "No gender",
      proposedValue: "—",
      reason: "No gender assigned",
    });
  }
  return suggestions;
}

/** Flag unions reduced to a single partner with no children for Review Suggestions. */
export function analyzeDegenerateUnionSuggestions(
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): NameRoleSuggestion[] {
  const suggestions: NameRoleSuggestion[] = [];
  const unionNodes = nodes.filter(
    (n): n is Node<UnionNodeData> =>
      n.type === "union" && (n.data as UnionNodeData).kind === "union"
  );

  for (const u of unionNodes) {
    const d = u.data as UnionNodeData;
    const partnerIds = (d.partnerIds ?? []).filter((id): id is string => id != null);
    const childCount = edges.filter((e) => e.source === u.id && isChildEdge(e)).length;
    if (partnerIds.length === 1 && childCount === 0) {
      suggestions.push({
        nodeId: partnerIds[0]!,
        field: "unionHealth",
        currentValue: "1 partner, 0 children",
        proposedValue: "—",
        reason:
          "This union has only one partner and no children. Consider adding a partner, adding children, or removing the union.",
        unionId: u.id,
      });
    }
  }

  return suggestions;
}

/** Flag families with no crowned main-graph union. */
export function analyzeMainGraphSuggestions(
  nodes: Node<FamilyTreeNodeData>[],
  families: FamilyGroup[]
): NameRoleSuggestion[] {
  const suggestions: NameRoleSuggestion[] = [];
  for (const family of families) {
    if (family.unionIds.length === 0) continue;
    const hasCrown = family.unionIds.some(
      (uid) => (nodes.find((n) => n.id === uid)?.data as UnionNodeData)?.isMainGraph
    );
    if (hasCrown) continue;
    const firstUnionId = family.unionIds[0]!;
    suggestions.push({
      nodeId: firstUnionId,
      field: "mainGraph",
      currentValue: "No main graph",
      proposedValue: "—",
      reason: `Family "${family.name}" has no main graph — crown a union to define the main graph`,
      unionId: firstUnionId,
    });
  }
  return suggestions;
}

/** Flag unions where a parent and child share the same generation anchor. */
export function analyzeGenConflictSuggestions(
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

  for (const u of unionNodes) {
    const d = u.data as UnionNodeData;
    const partnerIds = (d.partnerIds ?? []).filter((id): id is string => id != null);
    const childIds = edges
      .filter((e) => e.source === u.id && isChildEdge(e))
      .map((e) => e.target)
      .filter((id) => personById.has(id));

    const conflicts: string[] = [];
    for (const partnerId of partnerIds) {
      const partnerGen = (personById.get(partnerId)?.data as PersonNodeData)?.genAnchorId;
      if (!partnerGen) continue;
      for (const childId of childIds) {
        const childGen = (personById.get(childId)?.data as PersonNodeData)?.genAnchorId;
        if (childGen && childGen === partnerGen) {
          const partnerName =
            getPersonDisplayName(
              personById.get(partnerId)!.data as PersonNodeData,
              partnerId,
              nodes
            ) || partnerId;
          const childName =
            getPersonDisplayName(
              personById.get(childId)!.data as PersonNodeData,
              childId,
              nodes
            ) || childId;
          conflicts.push(`${partnerName} (parent) and ${childName} (child)`);
        }
      }
    }

    if (conflicts.length > 0) {
      suggestions.push({
        nodeId: partnerIds[0] ?? u.id,
        field: "genConflict",
        currentValue: "Same gen as parent/child",
        proposedValue: "—",
        reason: `${conflicts.join("; ")} share the same generation anchor.`,
        unionId: u.id,
      });
    }
  }

  return suggestions;
}

/** Flag persons with no generation anchor assigned. */
export function analyzeNoGenSuggestions(
  nodes: Node<FamilyTreeNodeData>[]
): NameRoleSuggestion[] {
  const suggestions: NameRoleSuggestion[] = [];
  for (const n of nodes) {
    if (n.data.kind !== "person") continue;
    const d = n.data as PersonNodeData;
    if (d.genAnchorId) continue;
    suggestions.push({
      nodeId: n.id,
      field: "noGen",
      currentValue: "No generation",
      proposedValue: "—",
      reason: "No generation assigned",
    });
  }
  return suggestions;
}

/** Informational suggestions for nodes missing family assignment and/or canvas location. */
export function analyzeUnassignedSuggestions(
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[],
  families: FamilyGroup[]
): NameRoleSuggestion[] {
  const suggestions: NameRoleSuggestion[] = [];
  for (const n of nodes) {
    const reasons = getUnassignedReasons(n.id, nodes, edges, families);
    for (const family of families) {
      reasons.push(...getFamilyNodeWarnings(n.id, family, nodes, edges));
    }
    const unique = [...new Set(reasons)];
    if (unique.length === 0) continue;
    suggestions.push({
      nodeId: n.id,
      field: "unassigned",
      currentValue: "Unassigned",
      proposedValue: "—",
      reason: unique.join("; "),
    });
  }
  return suggestions;
}

/** Warning reasons for nodes within a family tab (disconnected union cluster, unionless person). */
export function getFamilyNodeWarnings(
  nodeId: string,
  family: FamilyGroup,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): string[] {
  const warnings: string[] = [];
  if (!family.unionIds.includes(nodeId) && !family.memberPersonIds.includes(nodeId)) {
    return warnings;
  }
  const analysis = computeFamilyClusterAnalysis(family, nodes, edges);
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return warnings;
  const crownedId = family.unionIds.find(
    (uid) => (nodes.find((n) => n.id === uid)?.data as UnionNodeData)?.isMainGraph
  );
  if (node.data.kind === "person" && analysis.unionlessPersonIds.includes(nodeId)) {
    warnings.push("Not linked to any union in this family");
  }
  if (node.data.kind === "union" && family.unionIds.includes(nodeId)) {
    if (!crownedId) {
      warnings.push("No main graph set for this family — crown a union to define the main graph");
    } else if (analysis.unassignedUnionIds.includes(nodeId)) {
      const components = computeComponentsForUnionSubset(analysis.unassignedUnionIds, nodes, edges);
      const myComponent = components.find((c) => c.includes(nodeId));
      const clusterSize = myComponent?.length ?? 1;
      warnings.push(
        clusterSize <= 1
          ? "Union is not connected to the main family graph"
          : "Union cluster is not connected to the main family graph"
      );
    }
  }
  return warnings;
}

/** Human-readable reasons a node is considered unassigned. */
export function getUnassignedReasons(
  nodeId: string,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[],
  families: FamilyGroup[]
): string[] {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return [];
  const reasons: string[] = [];

  const inFamily = families.some((f) => {
    const members =
      f.memberPersonIds.length > 0
        ? f.memberPersonIds
        : getFamilyMemberPersonIds(f.unionIds, nodes, edges);
    return members.includes(nodeId);
  });

  const linkedToUnion =
    node.data.kind === "union" ||
    edges.some(
      (e) =>
        (isPartnerEdge(e) && (e.source === nodeId || e.target === nodeId)) ||
        (isChildEdge(e) && (e.source === nodeId || e.target === nodeId))
    );

  if (!inFamily && !linkedToUnion && node.data.kind === "person") {
    reasons.push("Not assigned to a family");
  }

  const unset =
    node.data.kind === "person"
      ? (node.data as PersonNodeData).positionUnset
      : (node.data as UnionNodeData).positionUnset;
  if (unset) {
    reasons.push("No canvas location");
  }

  return reasons;
}

/** True when node lacks family and/or canvas location (shown in Unassigned sidebar section). */
export function isNodeUnassigned(
  nodeId: string,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[],
  families: FamilyGroup[]
): boolean {
  return getUnassignedReasons(nodeId, nodes, edges, families).length > 0;
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
    /** When set, only emit declarations/blocks for these node ids. */
    scopeNodeIds?: Set<string>;
    /** When false, omit connection style header (default true unless scoped). */
    includeConnectionStyles?: boolean;
    /** Branches to emit in @branches section. */
    branches?: BranchRecord[];
  }
): string {
  const compactDeclarations = options?.compactDeclarations ?? false;
  const showNodeInfo = options?.showNodeInfo ?? false;
  const nodeInfoTopLeft = options?.nodeInfoTopLeft ?? true;
  const nodeInfoCenter = options?.nodeInfoCenter ?? false;
  const nodeInfoSize = options?.nodeInfoSize ?? false;
  const nodeSizesById = options?.nodeSizesById ?? {};
  const generationAnchors = options?.generationAnchors ?? [];
  const connectionStyles = options?.connectionStyles ?? [];
  const scopeNodeIds = options?.scopeNodeIds;
  const branches = options?.branches ?? [];
  const includeConnectionStyles =
    options?.includeConnectionStyles ?? scopeNodeIds == null;

  const anchorById = new Map(generationAnchors.map((a) => [a.id, a]));
  const hasAnchors = generationAnchors.length > 0;
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

  const personNodes = nodes
    .filter((n): n is Node<PersonNodeData> => n.data.kind === "person")
    .filter((n) => scopeNodeIds == null || scopeNodeIds.has(n.id))
    .sort((a, b) => {
      const nameA = (a.data.name || "").toLowerCase();
      const nameB = (b.data.name || "").toLowerCase();
      const cmp = nameA.localeCompare(nameB);
      if (cmp !== 0) return cmp;
      return a.id.localeCompare(b.id);
    });

  const unionNodes = nodes
    .filter(
      (n): n is Node<UnionNodeData & { position: { x: number; y: number } }> =>
        n.type === "union" && (n.data as UnionNodeData).kind === "union"
    )
    .filter((n) => scopeNodeIds == null || scopeNodeIds.has(n.id))
    .sort((a, b) => {
      if (a.position.y !== b.position.y) return a.position.y - b.position.y;
      if (a.position.x !== b.position.x) return a.position.x - b.position.x;
      return a.id.localeCompare(b.id);
    });

  const personById = new Map(personNodes.map((n) => [n.id, n]));
  const lines: string[] = [];
  const indent = compactDeclarations ? "" : "  ";

  const getSize = (id: string, isUnion: boolean) => {
    const sz = nodeSizesById[id];
    if (sz) return { w: Math.round(sz.width), h: Math.round(sz.height) };
    return isUnion
      ? { w: DEFAULT_UNION_W, h: DEFAULT_UNION_H }
      : { w: DEFAULT_PERSON_W, h: DEFAULT_PERSON_H };
  };

  if (includeConnectionStyles && connectionStyles.length > 0) {
    lines.push("# Connection Styles");
    for (const style of connectionStyles) {
      const dash = `[${style.dashPattern.join(", ")}]`;
      const descPart = style.description
        ? `, description: "${style.description.replace(/"/g, '\\"')}"`
        : "";
      lines.push(
        `@${style.id} "${style.name}" { stroke: ${style.stroke}, width: ${style.strokeWidth}, dash: ${dash}${descPart} }`
      );
    }
    lines.push("");
  }

  lines.push("@declarations");
  for (const n of personNodes) {
    const blockLines = formatPersonBlockLines(n, {
      indent,
      compact: compactDeclarations,
      genIndex: getGenIndexForPerson(n),
      showNodeInfo,
      nodeInfoTopLeft,
      nodeInfoCenter,
      nodeInfoSize,
      getSize,
    });
    lines.push(...blockLines);
    if (!compactDeclarations) lines.push("");
  }
  if (personNodes.length > 0 && !compactDeclarations) lines.pop();

  lines.push("");
  lines.push("@familyTree");
  lines.push("");

  for (const union of unionNodes) {
    const data = union.data as UnionNodeData;
    const unionUnset = data.positionUnset;
    const libraryStyle = data.connectionStyleId
      ? connectionStyles.find((s) => s.id === data.connectionStyleId)
      : undefined;

    if (compactDeclarations) {
      const parts = [
        `name: "${escapeScriptQuoted(data.name ?? "")}"`,
        unionUnset
          ? "x: ? y: ?"
          : `x: ${Math.round(union.position.x)} y: ${Math.round(union.position.y)}`,
        `notes: "${escapeScriptQuoted(data.notes ?? "")}"`,
      ];
      if (libraryStyle) parts.push(`style: "${escapeScriptQuoted(libraryStyle.name)}"`);
      if (data.isMainGraph) parts.push("mainGraph: true");
      lines.push(`Union ${union.id} { ${parts.join(" ")} }`);
      continue;
    }

    lines.push(`Union ${union.id} {`);
    lines.push(`${indent}name: "${escapeScriptQuoted(data.name ?? "")}"`);
    const xLine = formatCoordField("x", union.position.x, unionUnset, indent);
    const yLine = formatCoordField("y", union.position.y, unionUnset, indent);
    if (xLine) lines.push(xLine);
    if (yLine) lines.push(yLine);
    if (libraryStyle) lines.push(`${indent}style: "${escapeScriptQuoted(libraryStyle.name)}"`);
    if (data.isMainGraph) lines.push(`${indent}mainGraph: true`);
    const arrangeParts: string[] = [];
    if (data.arrangeSpacing?.parentSpacing != null) {
      arrangeParts.push(`parents=${data.arrangeSpacing.parentSpacing}`);
    }
    if (data.arrangeSpacing?.childSpacing != null) {
      arrangeParts.push(`children=${data.arrangeSpacing.childSpacing}`);
    }
    if (data.arrangeSpacing?.verticalSpacing != null) {
      arrangeParts.push(`vertical=${data.arrangeSpacing.verticalSpacing}`);
    }
    if (data.arrangeSpacing?.parentAlignment) {
      arrangeParts.push(`align=${data.arrangeSpacing.parentAlignment}`);
    }
    if (arrangeParts.length > 0) {
      lines.push(`${indent}arrange: ${arrangeParts.join(", ")}`);
    }

    const formatMemberType = (memberType: string): string => {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(memberType)) return memberType;
      return `"${escapeScriptQuoted(memberType)}"`;
    };

    const emitMember = (
      personId: string | null | undefined,
      memberType: string,
      extraBraceFields?: Record<string, string>
    ) => {
      if (!personId || !personById.has(personId)) return;
      const person = personById.get(personId)!;
      const typeToken = formatMemberType(memberType);
      if (unionUnset || person.data.positionUnset) {
        lines.push(`${indent}Person ${personId} type: ${typeToken}`);
        return;
      }
      const dx = Math.round(person.position.x - union.position.x);
      const dy = Math.round(person.position.y - union.position.y);
      const extraParts = extraBraceFields
        ? Object.entries(extraBraceFields).map(([k, v]) => `${k}: ${formatMemberType(v)}`)
        : [];
      const braceInner = [`x': ${dx}`, `y': ${dy}`, ...extraParts].join(", ");
      lines.push(`${indent}Person ${personId} type: ${typeToken} { ${braceInner} }`);
    };

    for (const partner of getUnionPartners(data)) {
      emitMember(partner.personId, partner.role ?? "parent");
    }

    const childIds = edges
      .filter((e) => e.source === union.id && isChildEdge(e))
      .map((e) => e.target)
      .filter((id) => personById.has(id));
    const childNodes = childIds
      .map((id) => personById.get(id)!)
      .sort((a, b) => a.position.x - b.position.x || a.id.localeCompare(b.id));

    childNodes.forEach((child) => {
      const childEdge = edges.find(
        (e) => e.source === union.id && e.target === child.id && isChildEdge(e)
      );
      const childRole = (childEdge?.data as FamilyTreeEdgeData | undefined)?.childRole;
      emitMember(
        child.id,
        "child",
        childRole ? { role: childRole } : undefined
      );
    });

    lines.push(`${indent}notes: "${escapeScriptQuoted(data.notes ?? "")}"`);
    lines.push("}");
    lines.push("");
  }

  const scopedBranches =
    scopeNodeIds == null
      ? branches
      : branches.filter((b) => scopeNodeIds.has(b.rootPersonId));

  if (scopedBranches.length > 0) {
    lines.push("@branches");
    lines.push("");
    for (const branch of scopedBranches.sort((a, b) => a.id.localeCompare(b.id))) {
      const unionIds = computeBranchUnionIds(branch.rootPersonId, nodes, edges);
      const namePart = branch.name ? ` "${escapeScriptQuoted(branch.name)}"` : "";
      lines.push(
        `Branch ${branch.id}${namePart} root: ${branch.rootPersonId} mode: ${branch.mode} {`
      );
      lines.push(`  unions: [${unionIds.join(", ")}]`);
      if (branch.description.trim()) {
        lines.push(`  description: "${escapeScriptQuoted(branch.description)}"`);
      }
      lines.push("}");
      lines.push("");
    }
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
 *   [First, Middle, Last] # id: _abc123 x: 120 y: 340 nickname: a, b gen: 0
 *   [Full Name] # id: _abc123  (legacy)
 *   [First, Middle, Last](id) x: 120 y: 340 nickname: a, b gen: 0  (compact)
 * @returns Parsed result or null if no declaration found.
 */
function parseDeclarationPosition(line: string): { x: number; y: number } | undefined {
  const m = line.match(/\bx:\s*(-?\d+(?:\.\d+)?)\s+y:\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  return { x: Math.round(parseFloat(m[1]!)), y: Math.round(parseFloat(m[2]!)) };
}

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
  position?: { x: number; y: number };
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
      position: parseDeclarationPosition(line),
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
    position: parseDeclarationPosition(line),
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

/** Compute next Union N: max existing "Union {N}" + 1, or 1 if none. */
function nextUnionNumber(nodes: Node<FamilyTreeNodeData>[]): number {
  let max = 0;
  const unionNodes = nodes.filter((n) => (n.data as { kind?: string }).kind === "union");
  for (const n of unionNodes) {
    const name = (n.data as UnionNodeData).name;
    const m = name?.match(/^Union (\d+)$/);
    if (m) {
      const num = parseInt(m[1]!, 10);
      if (num > max) max = num;
    }
  }
  return max + 1;
}

/** First known parent role for a person across any union, or null. */
function getPersonParentRole(
  personId: string,
  nodes: Node<FamilyTreeNodeData>[]
): ParentRole | null {
  for (const n of nodes) {
    if ((n.data as UnionNodeData).kind !== "union") continue;
    const data = n.data as UnionNodeData;
    for (const slot of getUnionPartners(data)) {
      if (slot.personId === personId && slot.role) return slot.role;
    }
  }
  return null;
}

/** True when this person holds the "unknown" role in any union. */
export function hasUnknownParentRole(
  personId: string,
  nodes: Node<FamilyTreeNodeData>[]
): boolean {
  for (const n of nodes) {
    if ((n.data as UnionNodeData).kind !== "union") continue;
    const data = n.data as UnionNodeData;
    for (const slot of getUnionPartners(data)) {
      if (slot.personId === personId && slot.role === "unknown") return true;
    }
  }
  return false;
}

function applyUnknownRoleNameToPerson(
  nodes: Node<FamilyTreeNodeData>[],
  personId: string | null | undefined
): Node<FamilyTreeNodeData>[] {
  if (!personId) return nodes;
  return nodes.map((n) =>
    n.id === personId && isPersonData(n.data)
      ? {
          ...n,
          data: {
            ...(n.data as PersonNodeData),
            firstName: "Unknown",
            middleName: "",
            lastName: "",
            name: "Unknown",
          },
        }
      : n
  );
}

function oppositeParentRole(role: ParentRole): ParentRole | undefined {
  const lower = role.toLowerCase();
  if (lower === "father") return "mother";
  if (lower === "mother") return "father";
  if (lower === "adoptive_father") return "adoptive_mother";
  if (lower === "adoptive_mother") return "adoptive_father";
  return undefined;
}

function makeNewPersonNode(
  id: string,
  name: string,
  position: { x: number; y: number }
): Node<PersonNodeData> {
  return {
    id,
    type: "person",
    position,
    data: {
      kind: "person",
      name,
      firstName: name,
      middleName: "",
      lastName: "",
      notes: "",
      nicknames: [],
      isGenArmed: false,
    },
  };
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
  /** When set, primarySelectedNodeId stays pinned even if selectedNodeIds is reordered. */
  primarySelectionPinnedId: string | null;
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
  scriptCompactDeclarations: boolean;
  styleEditorOpenUnionId: string | null;
  showGenerationAnchors: boolean;
  showGenInheritIndicator: boolean;
  /** Opacity (0-100) of the generation anchor band tint on the canvas. */
  genAnchorBandOpacity: number;
  /** Opacity (0-100) of the generation anchor dividing lines on the canvas. */
  genAnchorLineOpacity: number;
  generationAnchors: GenerationAnchor[];
  connectionStyles: ConnectionStyleDef[];
  /** Project-level custom parent role labels. */
  customParentRoles: string[];
  /** Project-level custom gender labels. */
  customGenders: string[];
  /** Project-level custom child role labels. */
  customChildRoles: string[];
  /** Anchor ids in edit mode (draggable, capture input). Confirmed anchors pass input through. */
  editingAnchorIds: string[];
  genLabelMode: "letters" | "numbers" | "both";
  genInheritFlashByNodeId: Record<string, { token: number; label: string }>;
  pendingGenChangePrompt: {
    nodeId: string;
    nodeName: string;
    fromAnchorId: string;
    toAnchorId: string | null;
    fromLabel: string;
    toLabel: string;
    previousPosition: { x: number; y: number };
  } | null;
  marqueeToolActive: boolean;
  isSpacePanning: boolean;
  exportGuidesVisible: boolean;
  showLegend: boolean;
  legendMode: "tooltips" | "tooltipsAndIcons";
  subEntitySelectionMode: "node" | "union";
  setSubEntitySelectionMode: (mode: "node" | "union") => void;
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
  setSelectionWithPrimary: (ids: string[], primaryId: string) => void;
  setViewportBounds: (bounds: { minX: number; minY: number; maxX: number; maxY: number } | null) => void;
  setSnapToGrid: (v: boolean) => void;
  setShowNodeInfoEnabled: (v: boolean) => void;
  setNodeInfoTopLeft: (v: boolean) => void;
  setNodeInfoCenter: (v: boolean) => void;
  setNodeInfoSize: (v: boolean) => void;
  setNodeInfoSpacing: (v: boolean) => void;
  setPersistUnionSelectionOnChildCreate: (v: boolean) => void;
  setStyleEditorOpenUnionId: (id: string | null) => void;
  setScriptCompactDeclarations: (v: boolean) => void;
  setShowGenerationAnchors: (v: boolean) => void;
  setShowGenInheritIndicator: (v: boolean) => void;
  setGenAnchorBandOpacity: (v: number) => void;
  setGenAnchorLineOpacity: (v: number) => void;
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
  setEdgeConnectionStyleId: (edgeId: string, styleId: string | undefined) => void;
  setEdgeConnectionStyleOverride: (edgeId: string, style: ConnectionVisualStyle | undefined) => void;
  clearEdgeConnectionStyle: (edgeId: string) => void;
  setUnionFamilyLocked: (unionId: string, locked: boolean) => void;
  setUnionMainGraph: (unionId: string, value: boolean) => void;
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
  setLegendMode: (v: "tooltips" | "tooltipsAndIcons") => void;
  setExportGuideScale: (v: number) => void;
  setShowExportDialog: (v: boolean) => void;
  setExportOptions: (opts: Partial<FamilyTreeStore["exportOptions"]>) => void;
  setAutosaveEnabled: (v: boolean) => void;
  addPerson: (options?: { genAnchorId?: string }) => string;
  createUnion: (partnerNodeIds: [string, string]) => string | null;
  createBackwardUnion: (childNodeIds: [string] | [string, string]) => string | null;
  createFullUnion: (options?: { seedPersonIds?: string[] }) => string | null;
  addChild: (unionNodeId: string) => string | null;
  addParent: (unionNodeId: string) => string | null;
  /** Link existing person to union. Forward = add as parent, Backward = add as child. Returns error message on failure. */
  linkPersonToUnion: (unionId: string, personId: string, mode: UnionType) => string | null;
  defaultUnionType: UnionCreateMode;
  setDefaultUnionType: (t: UnionCreateMode) => void;
  fullUnionSettings: FullUnionSettings;
  setFullUnionSettings: (patch: Partial<FullUnionSettings>) => void;
  resetFullUnionSettings: () => void;
  updateNodeName: (nodeId: string, name: string) => void;
  updatePersonNameParts: (nodeId: string, parts: { firstName: string; middleName: string; lastName: string }) => void;
  updatePersonNicknames: (nodeId: string, nicknames: string[]) => void;
  updateNodeNotes: (nodeId: string, notes: string) => void;
  setUnionName: (unionId: string, name: string) => void;
  updateUnionPartnerRole: (unionId: string, slot: "left" | "right", role: ParentRole | null) => void;
  updateUnionPartnerRoleAt: (unionId: string, partnerIndex: number, role: ParentRole | null) => void;
  updateChildRole: (unionId: string, personId: string, role: ChildRole | null) => void;
  swapUnionPartners: (unionId: string) => boolean;
  moveUnionPartner: (unionId: string, fromIndex: number, toIndex: number) => boolean;
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
  /** When true, the Review nodes modal is open. Used by Inspector to open it. */
  reviewNodesModalOpen: boolean;
  setReviewNodesModalOpen: (v: boolean) => void;
  /** Edge hover tooltip: which connection is hovered and its resolved style label. */
  hoveredConnectionInfo: {
    unionId: string;
    personName: string;
    styleName: string;
    description?: string;
  } | null;
  setHoveredConnectionInfo: (info: FamilyTreeStore["hoveredConnectionInfo"]) => void;
  /** Persisted family tabs (memberPersonIds derived on reconcile). */
  families: FamilyGroup[];
  /** null = "All" tab; otherwise family id. */
  activeFamilyTabId: string | null;
  /** Last non-null family tab — used when assigning orphan nodes. */
  lastActiveFamilyTabId: string | null;
  isolationModeActive: boolean;
  /** Set when a family tab is clicked to trigger canvas focus. */
  pendingFocusFamilyId: string | null;
  /** Whether delete targets the active family tab or selected nodes. */
  deleteFocus: "family" | "nodes";
  /** Bloodline warning when deleting a bridge connection inside a family. */
  pendingBloodlineWarning: PendingBloodlineWarning | null;
  /** Pending delete confirmation (family tab or multi-node selection). */
  pendingDeleteConfirm: PendingDeleteConfirm | null;
  /** Family id awaiting scoped Clear confirmation. */
  pendingClearFamilyConfirm: string | null;
  /** Anchor blocking warning during click-canvas cross-family transfer. */
  pendingAnchorTransferWarning: PendingAnchorTransferWarning | null;
  /** Brief toast when a redundant connecting union is deleted. */
  familyConnectionNotice: string | null;
  /** When set, Inspector shows family-level properties instead of node properties. */
  inspectorFamilyId: string | null;
  /** Persisted branches (hidden groups and branch tabs). */
  branches: BranchRecord[];
  /** Active branch tab id; isolates canvas to that branch's members. */
  activeBranchTabId: string | null;
  /** When set, Inspector shows branch-level properties. */
  inspectorBranchId: string | null;
  branchToolActive: boolean;
  /** Set when a branch tab is clicked to trigger canvas focus. */
  pendingFocusBranchId: string | null;
  setBranchToolActive: (v: boolean) => void;
  setActiveBranchTabId: (id: string | null) => void;
  setInspectorBranchId: (id: string | null) => void;
  setPendingFocusBranchId: (id: string | null) => void;
  toggleHideForPerson: (personId: string) => void;
  createOrConvertBranchTab: (personId: string) => void;
  setBranchCustomName: (branchId: string, name: string) => void;
  setBranchDescription: (branchId: string, description: string) => void;
  deleteBranch: (branchId: string) => void;
  recomputeFamilies: () => void;
  setActiveFamilyTabId: (id: string | null) => void;
  setDeleteFocus: (focus: "family" | "nodes") => void;
  /** Create an empty family tab (optionally seeded with unions/persons). */
  createFamily: (unionIds?: string[], personIds?: string[]) => string;
  deleteFamily: (familyId: string) => void;
  moveNodesToFamily: (nodeIds: string[], familyId: string) => void;
  /** Move unassigned union clusters to a new family tab; returns new family id. */
  transferUnionsToNewFamily: (
    unionIds: string[],
    sourceFamilyId: string,
    restrictPersonIds?: string[] | null
  ) => string | null;
  /** Move unassigned union clusters from one family tab into an existing family tab. */
  transferUnionsToFamily: (
    unionIds: string[],
    sourceFamilyId: string,
    targetFamilyId: string,
    restrictPersonIds?: string[] | null
  ) => void;
  setPersonAnchored: (personId: string, anchored: boolean) => void;
  setPersonGender: (personId: string, gender: string | null) => void;
  setPersonGenAnchorLocked: (personId: string, locked: boolean) => void;
  addCustomParentRole: (label: string) => void;
  addCustomGender: (label: string) => void;
  addCustomChildRole: (label: string) => void;
  setIsolationModeActive: (v: boolean) => void;
  setPendingFocusFamilyId: (id: string | null) => void;
  setInspectorFamilyId: (id: string | null) => void;
  setFamilyCustomName: (familyId: string, name: string) => void;
  setFamilyDescription: (familyId: string, description: string) => void;
  setFamilyNotes: (familyId: string, notes: string) => void;
  setFamilyColor: (familyId: string, color: string | undefined) => void;
  requestRemoveConnection: (target: RemoveConnectionTarget) => string | null;
  resolveBloodlineWarning: (choice: "deleteDescendants" | "keep") => void;
  requestDeleteSelection: () => void;
  performDeleteNodes: (nodeIds: string[]) => void;
  confirmPendingDelete: () => void;
  cancelPendingDelete: () => void;
  resolveAnchorTransferWarning: (choice: "proceed" | "cancel") => void;
  loadTree: (projectId: string) => Promise<{ hadData: boolean }>;
  saveTree: () => Promise<boolean>;
  applyFamilyTreeScriptEdits: (content: string) => { ok: boolean; errors: string[] };
  flushSaveAndSave: () => Promise<boolean>;
  clearTree: (projectId?: string) => void;
  requestClearFamily: (familyId: string) => void;
  confirmClearFamily: () => void;
  cancelClearFamily: () => void;
  clearFamilyNodes: (familyId: string) => void;
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
  setUnionArrangeSpacing: (unionId: string, patch: UnionArrangeSpacingPatch) => void;
  applyAverageParentSpacing: (unionId: string) => boolean;
  applyAverageChildSpacing: (unionId: string) => boolean;
  applyAverageVerticalSpacing: (unionId: string) => boolean;
  applyParentAlignment: (unionId: string, alignment: "left" | "center" | "right") => boolean;
  /** Script display mode: nodes canvas vs full text editor. */
  displayMode: "nodes" | "text";
  /** Persisted script text files (family grouping derived at runtime). */
  documents: FamilyTreeDocumentRecord[];
  dirtyDocumentIds: string[];
  /** Last opened script file per family tab (session-persisted). */
  lastDocumentIdByFamilyId: Record<string, string>;
  setDisplayMode: (mode: "nodes" | "text") => void;
  setDirtyDocumentIds: (ids: string[]) => void;
  setLastDocumentForFamily: (familyId: string, docId: string) => void;
  createFamilyDocument: (name?: string, ownerFamilyId?: string | null) => string;
  renameFamilyDocument: (id: string, name: string) => void;
  deleteFamilyDocumentCascade: (
    docId: string,
    content: string
  ) => { personCount: number; unionCount: number };
  applyFamilyDocumentEdits: (
    edits: { docId: string; content: string }[]
  ) => { ok: boolean; errors: string[] };
  ensureDefaultDocuments: () => void;
  getDocumentDisplayContent: (docId: string) => string;
  /** Node/union id armed for click-to-place on canvas. */
  placementTargetId: string | null;
  setPlacementTargetId: (id: string | null) => void;
  /** Assign canvas coordinates to an unplaced node (and its family members when union). */
  placeNodeAt: (nodeId: string, position: { x: number; y: number }) => void;
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
let prevShowGenerationAnchors: boolean | null = null;
let prevShowGenInheritIndicator: boolean | null = null;
let prevGenAnchorBandOpacity: number | null = null;
let prevGenAnchorLineOpacity: number | null = null;
let prevGenLabelMode: "letters" | "numbers" | "both" | null = null;
let prevGenerationAnchorsJson: string | null = null;
let prevConnectionStylesJson: string | null = null;
let prevFamiliesJson: string | null = null;
let prevBranchesJson: string | null = null;
let prevDocumentsRef: FamilyTreeDocumentRecord[] | null = null;
let prevDocumentsUpdatedAtSum = 0;
let prevDisplayMode: "nodes" | "text" | null = null;
let prevLegendMode: "tooltips" | "tooltipsAndIcons" | null = null;
let prevSubEntitySelectionMode: "node" | "union" | null = null;
let prevLastDocumentIdJson: string | null = null;
let prevFullUnionSettingsJson: string | null = null;
let prevDefaultUnionType: UnionCreateMode | null = null;

function applyNodePositionUpdates(
  get: () => FamilyTreeStore,
  updateMap: Record<string, { x: number; y: number }>,
  unionId?: string,
  backfill?: { leftPartnerId: string; rightPartnerId: string } | null
) {
  const { setNodes } = get();
  setNodes((prev) =>
    prev.map((node) => {
      const posUpdate = node.id in updateMap ? updateMap[node.id] : undefined;
      const dataUpdate = unionId && node.id === unionId && backfill ? backfill : undefined;
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
}

function snapGenAnchorsInScope(
  get: () => FamilyTreeStore,
  updateMap: Record<string, { x: number; y: number }>,
  scopeIds: string[],
  personById: Map<string, Node<PersonNodeData>>,
  snap: (x: number, y: number) => { x: number; y: number }
) {
  const { generationAnchors } = get();
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
}

/** Place parent pair as a rigid unit aligned to the current child row span; children X/Y untouched. */
function computePartnersCentroidX(
  partnerNodes: Node<PersonNodeData>[],
  getW: (id: string) => number,
  getPos: (id: string) => { x: number; y: number } | undefined
): number {
  if (partnerNodes.length === 0) return 0;
  let sum = 0;
  for (const n of partnerNodes) {
    const pos = getPos(n.id);
    if (!pos) continue;
    sum += pos.x + getW(n.id) / 2;
  }
  return sum / partnerNodes.length;
}

function computeParentSpanWidth(
  partnerNodes: Node<PersonNodeData>[],
  parentSpacing: number,
  getW: (id: string) => number
): number {
  if (partnerNodes.length === 0) return 0;
  if (partnerNodes.length === 1) return getW(partnerNodes[0]!.id);
  let span = 0;
  for (let i = 0; i < partnerNodes.length; i++) {
    span += getW(partnerNodes[i]!.id);
    if (i < partnerNodes.length - 1) span += parentSpacing;
  }
  return span;
}

function computeParentAlignmentPositions(
  get: () => FamilyTreeStore,
  unionId: string,
  alignment: "left" | "center" | "right"
): Record<string, { x: number; y: number }> | null {
  const s = get();
  const partnerNodes = resolveUnionPartnerNodes(unionId, s.nodes);
  const childSpan = getUnionChildRowSpan(unionId, s.nodes, s.edges, s.nodeSizesById);
  if (partnerNodes.length === 0 || !childSpan) return null;

  const unionNode = s.nodes.find((n) => n.id === unionId);
  const unionData = (unionNode?.data ?? {}) as UnionNodeData;
  const parentSpacing = unionData.arrangeSpacing?.parentSpacing ?? PARTNER_DX;
  const snap = (x: number, y: number) => (s.snapToGrid ? snapPosition(x, y, true) : { x, y });
  const getW = (id: string) => s.nodeSizesById[id]?.width ?? DEFAULT_PERSON_W;

  const parentSpanWidth = computeParentSpanWidth(partnerNodes, parentSpacing, getW);
  const childCenter = (childSpan.left + childSpan.right) / 2;

  let targetLeftX: number;
  if (alignment === "left") {
    targetLeftX = childSpan.left;
  } else if (alignment === "center") {
    targetLeftX = childCenter - parentSpanWidth / 2;
  } else {
    targetLeftX = childSpan.right - parentSpanWidth;
  }

  const partnerY =
    partnerNodes.reduce((sum, n) => sum + n.position.y, 0) / partnerNodes.length;
  const updateMap: Record<string, { x: number; y: number }> = {};
  let x = targetLeftX;
  for (let i = 0; i < partnerNodes.length; i++) {
    const node = partnerNodes[i]!;
    updateMap[node.id] = snap(x, partnerY);
    x += getW(node.id);
    if (i < partnerNodes.length - 1) x += parentSpacing;
  }

  const wU = s.nodeSizesById[unionId]?.width ?? DEFAULT_UNION_W;
  const parentCenterX = computePartnersCentroidX(partnerNodes, getW, (id) => updateMap[id]);
  const unionY = partnerY + UNION_DY;

  updateMap[unionId] = snap(parentCenterX - wU / 2, unionY);
  return updateMap;
}

function applyParentAlignmentImpl(
  get: () => FamilyTreeStore,
  unionId: string,
  alignment: "left" | "center" | "right"
): boolean {
  const updateMap = computeParentAlignmentPositions(get, unionId, alignment);
  if (!updateMap) return false;
  const s = get();
  const partnerNodes = resolveUnionPartnerNodes(unionId, s.nodes);
  if (partnerNodes.length === 0) return false;

  const personById = new Map(
    s.nodes.filter((n) => (n.data as { kind?: string }).kind === "person").map((n) => [n.id, n as Node<PersonNodeData>])
  );
  const snap = (x: number, y: number) => (s.snapToGrid ? snapPosition(x, y, true) : { x, y });
  const childIds = getUnionDirectChildren(unionId, s.nodes, s.edges).map((c) => c.id);
  snapGenAnchorsInScope(get, updateMap, [...partnerNodes.map((p) => p.id), ...childIds], personById, snap);

  const unionData = (s.nodes.find((n) => n.id === unionId)?.data ?? {}) as UnionNodeData;
  const backfillNeeded = !unionData.leftPartnerId || !unionData.rightPartnerId;
  const backfill = backfillNeeded
    ? {
        leftPartnerId: partnerNodes[0]!.id,
        rightPartnerId: partnerNodes[partnerNodes.length - 1]!.id,
      }
    : null;

  applyNodePositionUpdates(get, updateMap, unionId, backfill);
  return true;
}

function applyAverageParentSpacingImpl(get: () => FamilyTreeStore, unionId: string): boolean {
  const s = get();
  const gap = getUnionParentGap(unionId, s.nodes);
  const partnerNodes = resolveUnionPartnerNodes(unionId, s.nodes);
  if (gap == null || partnerNodes.length < 2) return false;

  const snap = (x: number, y: number) => (s.snapToGrid ? snapPosition(x, y, true) : { x, y });
  const updateMap: Record<string, { x: number; y: number }> = {};
  const first = partnerNodes[0]!;
  let x = first.position.x;
  updateMap[first.id] = snap(x, first.position.y);
  for (let i = 1; i < partnerNodes.length; i++) {
    x += gap;
    const node = partnerNodes[i]!;
    updateMap[node.id] = snap(x, node.position.y);
  }
  applyNodePositionUpdates(get, updateMap);
  return true;
}

function applyAverageChildSpacingImpl(get: () => FamilyTreeStore, unionId: string): boolean {
  const s = get();
  const children = getUnionDirectChildren(unionId, s.nodes, s.edges);
  if (children.length < 2) return false;
  const gap = getUnionChildrenAvgGap(unionId, s.nodes, s.edges);
  if (gap == null) return false;

  const partnerNodes = resolveUnionPartnerNodes(unionId, s.nodes);
  if (partnerNodes.length === 0) return false;

  const snap = (x: number, y: number) => (s.snapToGrid ? snapPosition(x, y, true) : { x, y });
  const getW = (id: string) => s.nodeSizesById[id]?.width ?? DEFAULT_PERSON_W;
  const first = partnerNodes[0]!;
  const last = partnerNodes[partnerNodes.length - 1]!;
  const leftPos = first.position;
  const rightPos = last.position;
  const wR = getW(last.id);
  const parentCenterX = computePartnersCentroidX(partnerNodes, getW, (id) =>
    s.nodes.find((n) => n.id === id)?.position
  );

  const n = children.length;
  const childWidths = children.map((c) => getW(c.id));
  const totalSpan = (n - 1) * gap;
  let rowStartX: number;
  if (s.childrenRowAlignment3Plus === "left") {
    rowStartX = leftPos.x;
  } else if (s.childrenRowAlignment3Plus === "right") {
    rowStartX = rightPos.x + wR - totalSpan - childWidths[n - 1]!;
  } else {
    rowStartX = parentCenterX - totalSpan / 2 - childWidths[0]! / 2;
  }

  const updateMap: Record<string, { x: number; y: number }> = {};
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    updateMap[child.id] = snap(rowStartX + i * gap, child.position.y);
  }
  applyNodePositionUpdates(get, updateMap);
  return true;
}

function applyAverageVerticalSpacingImpl(get: () => FamilyTreeStore, unionId: string): boolean {
  const s = get();
  const partnerNodes = resolveUnionPartnerNodes(unionId, s.nodes);
  const children = getUnionDirectChildren(unionId, s.nodes, s.edges);
  if (partnerNodes.length === 0 || children.length === 0) return false;

  const avgParentY = partnerNodes.reduce((sum, p) => sum + p.position.y, 0) / partnerNodes.length;
  const avgChildY = children.reduce((sum, c) => sum + c.position.y, 0) / children.length;
  const snap = (x: number, y: number) => (s.snapToGrid ? snapPosition(x, y, true) : { x, y });

  const updateMap: Record<string, { x: number; y: number }> = {};
  for (const partner of partnerNodes) {
    updateMap[partner.id] = snap(partner.position.x, avgParentY);
  }
  for (const child of children) {
    updateMap[child.id] = snap(child.position.x, avgChildY);
  }
  applyNodePositionUpdates(get, updateMap);
  return true;
}

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
  const partnerNodes = resolveUnionPartnerNodes(unionId, nodes);
  if (partnerNodes.length === 0) return false;

  const personById = new Map(
    nodes.filter((n) => (n.data as { kind?: string }).kind === "person").map((n) => [n.id, n])
  );

  const partnerIds = partnerNodes.map((n) => n.id);
  const leftId = partnerIds[0]!;
  const rightId = partnerIds[partnerIds.length - 1]!;

  const backfillNeeded = !unionData.leftPartnerId || !unionData.rightPartnerId;

  const parentSpacing = unionData.arrangeSpacing?.parentSpacing ?? PARTNER_DX;
  const childSpacing = unionData.arrangeSpacing?.childSpacing ?? UNIFORM_SPACING;
  const verticalSpacing = unionData.arrangeSpacing?.verticalSpacing ?? CHILD_DY;

  const snap = (x: number, y: number) => (snapToGrid ? snapPosition(x, y, true) : { x, y });
  const getW = (id: string) =>
    nodeSizesById[id]?.width ?? (personById.has(id) ? DEFAULT_PERSON_W : DEFAULT_UNION_W);

  if (unionData.arrangeSpacing?.parentAlignment) {
    const alignMap = computeParentAlignmentPositions(
      get,
      unionId,
      unionData.arrangeSpacing.parentAlignment
    );
    if (!alignMap) return false;
    const childIds = getUnionDirectChildren(unionId, nodes, edges).map((c) => c.id);
    snapGenAnchorsInScope(
      get,
      alignMap,
      [...partnerIds, ...childIds],
      personById as Map<string, Node<PersonNodeData>>,
      snap
    );
    const backfill = backfillNeeded ? { leftPartnerId: leftId, rightPartnerId: rightId } : null;
    applyNodePositionUpdates(get, alignMap, unionId, backfill);
    return true;
  }

  const updateMap: Record<string, { x: number; y: number }> = {};

  const anchorNode = partnerNodes.reduce((min, n) => (n.position.x < min.position.x ? n : min));
  const anchorX = anchorNode.position.x;
  const partnerY = anchorNode.position.y;

  for (let i = 0; i < partnerNodes.length; i++) {
    updateMap[partnerNodes[i]!.id] = snap(anchorX + i * parentSpacing, partnerY);
  }

  const leftPos = updateMap[leftId]!;
  const rightPos = updateMap[rightId]!;
  const wL = getW(leftId);
  const wR = getW(rightId);
  const parentCenterX = computePartnersCentroidX(partnerNodes, getW, (id) => updateMap[id]);
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
  const baselineY = partnerY + verticalSpacing;
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
    const totalSpan = (n - 1) * childSpacing;
    let rowStartX: number;
    if (childrenRowAlignment3Plus === "left") {
      rowStartX = leftPos.x;
    } else if (childrenRowAlignment3Plus === "right") {
      rowStartX = rightPos.x + wR - totalSpan - childWidths[n - 1];
    } else {
      rowStartX = parentCenterX - totalSpan / 2 - childWidths[0] / 2;
    }
    for (let i = 0; i < childNodes.length; i++) {
      updateMap[childNodes[i].id] = snap(rowStartX + i * childSpacing, baselineY);
    }
  }

  // Re-snap Y for any in-scope person pinned to a generation anchor.
  const scopeIds = [...partnerIds, ...sortedChildIds];
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
    partnerIds: string[];
    partnerNodes: Node<PersonNodeData>[];
    unionGen: number;
  };

  const validUnions: UnionWithPartners[] = [];
  for (const union of unionNodes) {
    const unionData = union.data as UnionNodeData;
    const partnerNodes = resolveUnionPartnerNodes(union.id, nodes);
    if (partnerNodes.length === 0) continue;
    const partnerIds = partnerNodes.map((n) => n.id);
    const gens = partnerIds.map((id) => personGen[id]).filter((g): g is number => g !== undefined);
    if (gens.length !== partnerIds.length) continue;
    const unionGen = Math.max(...gens);

    if (!unionData.leftPartnerId || !unionData.rightPartnerId) {
      const sorted = [...partnerNodes].sort((a, b) => {
        const posA = getEffectivePos(a.id);
        const posB = getEffectivePos(b.id);
        if (posA && posB) return posA.x - posB.x;
        return a.id.localeCompare(b.id);
      });
      backfillMap[union.id] = {
        leftPartnerId: sorted[0]!.id,
        rightPartnerId: sorted[sorted.length - 1]!.id,
      };
    }

    validUnions.push({ union, partnerIds, partnerNodes, unionGen });
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
  for (const { partnerIds } of unionsByGen.get(0) ?? []) {
    for (const pid of partnerIds) {
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
    partnerIds: string[],
    partnerNodes: Node<PersonNodeData>[]
  ) => {
    const firstId = partnerIds[0]!;
    const lastId = partnerIds[partnerIds.length - 1]!;
    const leftPos = getEffectivePos(firstId);
    const rightPos = getEffectivePos(lastId);
    if (!leftPos || !rightPos) return;
    const rawChildren = childrenOfUnion.get(union.id) ?? [];
    const wL = getW(firstId);
    const wR = getW(lastId);
    const parentCenterX = computePartnersCentroidX(partnerNodes, getW, (id) => getEffectivePos(id));
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
      let gen0Offset = 0;
      for (const { union, partnerIds, partnerNodes } of levelUnions) {
        for (let j = 0; j < partnerIds.length; j++) {
          updateMap[partnerIds[j]!] = snap(gen0Offset + j * UNIFORM_SPACING, personY);
        }
        const unionCenterX = computePartnersCentroidX(partnerNodes, getW, (id) => updateMap[id]);
        const wU = getW(union.id);
        updateMap[union.id] = snap(unionCenterX - wU / 2, unionY);
        gen0Offset += partnerIds.length * UNIFORM_SPACING + UNIFORM_SPACING;
      }
    } else {
      const parentUnions = unionsByGen.get(gen - 1) ?? [];
      for (const { union, partnerIds, partnerNodes } of parentUnions) {
        placeChildrenOfUnion(union, partnerIds, partnerNodes);
      }
      for (const { union, partnerNodes } of levelUnions) {
        const unionCenterX = computePartnersCentroidX(partnerNodes, getW, (id) => getEffectivePos(id));
        const wU = getW(union.id);
        updateMap[union.id] = snap(unionCenterX - wU / 2, unionY);
      }
    }
  }

  // Second pass: re-place children (using correct parent positions) and re-center unions.
  // Fixes layouts with dependency cycles where parents weren't placed yet on first pass.
  for (let gen = 0; gen <= maxGen; gen++) {
    const parentUnions = unionsByGen.get(gen) ?? [];
    for (const { union, partnerIds, partnerNodes } of parentUnions) {
      placeChildrenOfUnion(union, partnerIds, partnerNodes);
    }
  }
  for (const { union, partnerNodes } of validUnions) {
    const unionCenterX = computePartnersCentroidX(partnerNodes, getW, (id) => getEffectivePos(id));
    const unionGen = validUnions.find((u) => u.union.id === union.id)?.unionGen ?? 0;
    const unionY = unionGen * CHILD_DY + UNION_DY;
    const wU = getW(union.id);
    updateMap[union.id] = snap(unionCenterX - wU / 2, unionY);
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

function reconcileFamiliesImpl(
  get: () => FamilyTreeStore,
  set: (partial: Partial<FamilyTreeStore> | ((s: FamilyTreeStore) => Partial<FamilyTreeStore>)) => void
) {
  const s = get();
  const { nodes, edges, families: prevFamilies, activeFamilyTabId, lastActiveFamilyTabId } = s;

  const liveUnionIds = new Set(
    nodes
      .filter((n) => n.type === "union" && (n.data as UnionNodeData).kind === "union")
      .map((n) => n.id)
  );
  const livePersonIds = new Set(
    nodes.filter((n) => (n.data as PersonNodeData).kind === "person").map((n) => n.id)
  );

  let working: PersistedFamilyRecord[] = prevFamilies.map(({ memberPersonIds: _mp, ...rest }) => ({
    ...rest,
    unionIds: rest.unionIds.filter((uid) => liveUnionIds.has(uid)).sort(),
    personIds: (rest.personIds ?? []).filter((pid) => livePersonIds.has(pid)).sort(),
  }));

  working = working.filter(
    (f) => f.explicit || f.unionIds.length > 0 || (f.personIds ?? []).length > 0
  );

  if (working.length === 0 && nodes.length > 0) {
    working = [
      createNewFamilyRecord(Array.from(liveUnionIds), Array.from(livePersonIds)),
    ];
  }

  if (working.length > 0) {
    const targetId = activeFamilyTabId ?? lastActiveFamilyTabId ?? working[0]!.id;
    const targetIdx = working.findIndex((f) => f.id === targetId);
    const target = targetIdx >= 0 ? working[targetIdx]! : null;

    if (target) {
      for (const uid of liveUnionIds) {
        if (!working.some((f) => f.unionIds.includes(uid))) {
          target.unionIds = [...new Set([...target.unionIds, uid])].sort();
        }
      }

      for (const pid of livePersonIds) {
        const owned = working.some((f) => {
          if ((f.personIds ?? []).includes(pid)) return true;
          return getFamilyMemberPersonIds(f.unionIds, nodes, edges).includes(pid);
        });
        if (!owned) {
          target.personIds = [...new Set([...(target.personIds ?? []), pid])].sort();
        }
      }
    }
  }

  const familyGroups = working.map((r) => toFamilyGroup(r, nodes, edges));
  assignAutoFamilyNames(familyGroups, nodes);

  let newActiveTabId = activeFamilyTabId;
  if (activeFamilyTabId != null && !familyGroups.some((f) => f.id === activeFamilyTabId)) {
    newActiveTabId = null;
  }

  const familySnapshot = (groups: FamilyGroup[]) =>
    groups.map((f) => ({
      ...familiesToPersisted([f])[0]!,
      memberPersonIds: [...f.memberPersonIds].sort(),
    }));
  const prevJson = JSON.stringify(familySnapshot(prevFamilies));
  const nextJson = JSON.stringify(familySnapshot(familyGroups));
  if (prevJson === nextJson && newActiveTabId === activeFamilyTabId) return;

  set({
    families: familyGroups,
    activeFamilyTabId: newActiveTabId,
  });
}

function getScriptGenOptions(s: FamilyTreeStore) {
  return {
    compactDeclarations: s.scriptCompactDeclarations,
    showNodeInfo: s.showNodeInfoEnabled,
    nodeInfoTopLeft: s.nodeInfoTopLeft,
    nodeInfoCenter: s.nodeInfoCenter,
    nodeInfoSize: s.nodeInfoSize,
    nodeSizesById: s.nodeSizesById,
    generationAnchors: s.generationAnchors,
    genLabelMode: s.genLabelMode,
    connectionStyles: s.connectionStyles,
    branches: s.branches,
  };
}

function syncFamilyDocumentsFromModel(
  get: () => FamilyTreeStore,
  set: (partial: Partial<FamilyTreeStore>) => void
) {
  const s = get();
  if (s.documents.length === 0) return;
  const dirtySet = new Set(s.dirtyDocumentIds);
  let anyChanged = false;
  const opts = getScriptGenOptions(s);
  const updated = s.documents.map((doc) => {
    if (dirtySet.has(doc.id)) return doc;
    const nextContent = generateDocumentDisplayContent(
      doc,
      s.documents,
      s.nodes,
      s.edges,
      opts
    );
    if (nextContent === doc.content) return doc;
    anyChanged = true;
    return { ...doc, content: nextContent, updatedAt: Date.now() };
  });
  if (anyChanged) {
    set({ documents: updated, hasUnsavedChanges: true, lastSaveError: null });
  }
}

function ensureActiveFamilyTarget(
  get: () => FamilyTreeStore,
  set: (partial: Partial<FamilyTreeStore>) => void
): string {
  const s = get();
  const existingId = s.activeFamilyTabId ?? s.lastActiveFamilyTabId;
  if (existingId && s.families.some((f) => f.id === existingId)) {
    return existingId;
  }
  if (s.families.length > 0) {
    const id = s.families[0]!.id;
    set({ activeFamilyTabId: id, lastActiveFamilyTabId: id });
    return id;
  }
  const record = createNewFamilyRecord([], [], true);
  const groups = [toFamilyGroup(record, s.nodes, s.edges)];
  assignAutoFamilyNames(groups, s.nodes);
  set({
    families: groups,
    activeFamilyTabId: record.id,
    lastActiveFamilyTabId: record.id,
    hasUnsavedChanges: true,
    lastSaveError: null,
  });
  ensureDefaultDocumentsImpl(get, set);
  return record.id;
}

function appendNodeToFamilyRecord(
  families: FamilyGroup[],
  familyId: string,
  nodeId: string,
  kind: "person" | "union",
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): FamilyGroup[] {
  return families.map((f) => {
    if (f.id !== familyId) return f;
    const record: PersistedFamilyRecord = {
      id: f.id,
      unionIds: [...f.unionIds],
      personIds: [...(f.personIds ?? [])],
      explicit: f.explicit,
      name: f.name,
      isCustomName: f.isCustomName,
      description: f.description,
      parentFamilyIds: f.parentFamilyIds,
    };
    if (kind === "union") {
      if (!record.unionIds.includes(nodeId)) {
        record.unionIds = [...record.unionIds, nodeId].sort();
      }
    } else if (!record.personIds!.includes(nodeId)) {
      record.personIds = [...record.personIds!, nodeId].sort();
    }
    return toFamilyGroup(record, nodes, edges);
  });
}

function appendNodeDeclarationToDocumentImpl(
  get: () => FamilyTreeStore,
  set: (partial: Partial<FamilyTreeStore>) => void,
  familyId: string,
  nodeIds: string | string[]
) {
  const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
  if (ids.length === 0) return;
  const s = get();
  const dirtySet = new Set(s.dirtyDocumentIds);
  const targetDocId =
    s.lastDocumentIdByFamilyId[familyId] ??
    s.documents.find((d) => d.familyId === familyId && d.role !== "unassigned")?.id;
  if (!targetDocId || dirtySet.has(targetDocId)) return;

  const doc = s.documents.find((d) => d.id === targetDocId);
  if (!doc) return;

  const opts = getScriptGenOptions(s);
  const block = generateFamilyTreeScript(s.nodes, s.edges, {
    ...opts,
    scopeNodeIds: new Set(ids),
  }).trim();
  if (!block) return;

  const separator = doc.content.trim() ? "\n\n" : "";
  const nextContent = doc.content.endsWith("\n")
    ? `${doc.content}${separator}${block}\n`
    : `${doc.content}${separator}${block}\n`;

  set({
    documents: s.documents.map((d) =>
      d.id === targetDocId ? { ...d, content: nextContent, updatedAt: Date.now() } : d
    ),
    hasUnsavedChanges: true,
    lastSaveError: null,
  });
}

function stripNodeDeclarationsImpl(
  get: () => FamilyTreeStore,
  set: (partial: Partial<FamilyTreeStore>) => void,
  nodeIds: string[]
) {
  if (nodeIds.length === 0) return;
  const s = get();
  const idsToRemove = new Set(nodeIds);
  const dirtySet = new Set(s.dirtyDocumentIds);
  let changed = false;
  const nextDocuments = s.documents.map((doc) => {
    if (dirtySet.has(doc.id)) return doc;
    const { personIds, unionIds } = scanDocumentDeclaredIds(doc.content);
    const hasOverlap = [...personIds, ...unionIds].some((id) => idsToRemove.has(id));
    if (!hasOverlap) return doc;
    const nextContent = removeDeclarationBlocks(doc.content, idsToRemove);
    if (nextContent === doc.content) return doc;
    changed = true;
    return { ...doc, content: nextContent, updatedAt: Date.now() };
  });
  if (changed) {
    set({ documents: nextDocuments, hasUnsavedChanges: true, lastSaveError: null });
  }
}

function resyncAutoDocumentNamesImpl(
  get: () => FamilyTreeStore,
  set: (partial: Partial<FamilyTreeStore>) => void
) {
  const s = get();
  const familyById = new Map(s.families.map((f) => [f.id, f]));
  let changed = false;
  const nextDocuments = s.documents.map((doc) => {
    if (!doc.autoNamed || !doc.familyId) return doc;
    const family = familyById.get(doc.familyId);
    if (!family) return doc;
    const suffix = doc.nameSuffix ?? "";
    const expectedName = formatMainDocumentName(family.name, suffix);
    if (doc.name === expectedName) return doc;
    changed = true;
    return { ...doc, name: expectedName, updatedAt: Date.now() };
  });
  if (changed) {
    set({ documents: nextDocuments, hasUnsavedChanges: true, lastSaveError: null });
  }
}

function ensureDefaultDocumentsImpl(
  get: () => FamilyTreeStore,
  set: (partial: Partial<FamilyTreeStore>) => void
) {
  resyncAutoDocumentNamesImpl(get, set);
  const s = get();
  if (s.families.length === 0) return;
  const now = Date.now();
  let nextDocuments = [...s.documents];
  let changed = false;

  for (const family of s.families) {
    const familyDocs = nextDocuments.filter((d) => d.familyId === family.id);
    const mainDocs = familyDocs.filter((d) => d.role !== "unassigned");

    if (mainDocs.length === 0) {
      const suffix = nextDocumentSuffix(
        familyDocs.map((d) => d.name),
        family.name
      );
      nextDocuments.push({
        id: generateId(),
        name: formatMainDocumentName(family.name, suffix),
        familyId: family.id,
        role: "main",
        content: "@declarations\n\n@familyTree\n\n",
        updatedAt: now,
        autoNamed: true,
        nameSuffix: suffix,
      });
      changed = true;
    }

    const analysis = computeFamilyClusterAnalysis(family, s.nodes, s.edges);
    const unassignedNodeIds = [
      ...analysis.unassignedUnionIds,
      ...analysis.unionlessPersonIds,
    ];
    const existingUnassigned = familyDocs.find((d) => d.role === "unassigned");

    if (unassignedNodeIds.length > 0) {
      const refContent = generateUnassignedReferenceContent(
        unassignedNodeIds,
        nextDocuments,
        s.nodes,
        s.edges
      );
      if (existingUnassigned) {
        if (existingUnassigned.content !== refContent) {
          nextDocuments = nextDocuments.map((d) =>
            d.id === existingUnassigned.id
              ? { ...d, content: refContent, updatedAt: now }
              : d
          );
          changed = true;
        }
      } else {
        nextDocuments.push({
          id: generateId(),
          name: "Unassigned",
          familyId: family.id,
          role: "unassigned",
          content: refContent,
          updatedAt: now,
        });
        changed = true;
      }
    } else if (existingUnassigned) {
      nextDocuments = nextDocuments.filter((d) => d.id !== existingUnassigned.id);
      changed = true;
    }
  }

  if (changed) {
    set({ documents: nextDocuments, hasUnsavedChanges: true, lastSaveError: null });
  }
}

export { previewFamilyDocumentDeleteCounts };

export const useFamilyTreeStore = create<FamilyTreeStore>((set, get) => ({
  nodes: [],
  edges: [],
  activeProjectId: null,
  nodeSizesById: {},
  selectedNodeIds: [],
  primarySelectedNodeId: null,
  primarySelectionPinnedId: null,
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
  scriptCompactDeclarations: false,
  styleEditorOpenUnionId: null,
  showGenerationAnchors: true,
  showGenInheritIndicator: true,
  genAnchorBandOpacity: 6,
  genAnchorLineOpacity: 35,
  generationAnchors: [],
  connectionStyles: [],
  customParentRoles: [] as string[],
  customGenders: [] as string[],
  customChildRoles: [] as string[],
  editingAnchorIds: [] as string[],
  genLabelMode: "letters",
  genInheritFlashByNodeId: {},
  pendingGenChangePrompt: null,
  marqueeToolActive: false,
  isSpacePanning: false,
  exportGuidesVisible: false,
  showLegend: false,
  legendMode: "tooltips" as "tooltips" | "tooltipsAndIcons",
  subEntitySelectionMode: "node" as "node" | "union",
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
  defaultUnionType: "forward" as UnionCreateMode,
  fullUnionSettings: { ...DEFAULT_FULL_UNION_SETTINGS },
  exportViewportEl: null as HTMLElement | null,
  fitViewForExport: null as (() => void) | null,
  exportCaptureFlags: null as { includeNotes: boolean } | null,
  nameRoleSuggestions: [] as NameRoleSuggestion[],
  reviewNodesModalOpen: false,
  hoveredConnectionInfo: null,
  families: [] as FamilyGroup[],
  activeFamilyTabId: null as string | null,
  lastActiveFamilyTabId: null as string | null,
  isolationModeActive: false,
  pendingFocusFamilyId: null as string | null,
  deleteFocus: "nodes" as "family" | "nodes",
  pendingBloodlineWarning: null as PendingBloodlineWarning | null,
  pendingDeleteConfirm: null as PendingDeleteConfirm | null,
  pendingClearFamilyConfirm: null as string | null,
  pendingAnchorTransferWarning: null as PendingAnchorTransferWarning | null,
  familyConnectionNotice: null as string | null,
  inspectorFamilyId: null as string | null,
  branches: [] as BranchRecord[],
  activeBranchTabId: null as string | null,
  inspectorBranchId: null as string | null,
  branchToolActive: false,
  pendingFocusBranchId: null as string | null,
  displayMode: "nodes" as "nodes" | "text",
  documents: [] as FamilyTreeDocumentRecord[],
  dirtyDocumentIds: [] as string[],
  lastDocumentIdByFamilyId: {} as Record<string, string>,
  placementTargetId: null as string | null,

  setExportViewportEl: (el) => set({ exportViewportEl: el }),
  setFitViewForExport: (fn) => set({ fitViewForExport: fn }),
  setExportCaptureFlags: (f) => set({ exportCaptureFlags: f }),
  runLayout: () => runLayoutImpl(get),
  sortUnion: (unionId) => sortUnionImpl(get, unionId),
  runNameRoleAnalysis: () => {
    const s = get();
    set({
      nameRoleSuggestions: [
        ...analyzeNameAndRoleSuggestions(s.nodes, s.edges),
        ...analyzeDegenerateUnionSuggestions(s.nodes, s.edges),
        ...analyzeGenConflictSuggestions(s.nodes, s.edges),
        ...analyzeUnassignedSuggestions(s.nodes, s.edges, s.families),
        ...analyzeNoGenSuggestions(s.nodes),
        ...analyzeUnassignedRoleSuggestions(s.nodes),
        ...analyzeNoGenderSuggestions(s.nodes),
        ...analyzeMainGraphSuggestions(s.nodes, s.families),
      ],
    });
  },
  setReviewNodesModalOpen: (v) => set({ reviewNodesModalOpen: v }),
  setHoveredConnectionInfo: (info) => set({ hoveredConnectionInfo: info }),
  recomputeFamilies: () => {
    reconcileFamiliesImpl(get, set);
    ensureDefaultDocumentsImpl(get, set);
  },
  setActiveFamilyTabId: (id) =>
    set({
      activeFamilyTabId: id,
      deleteFocus: "family",
      ...(id != null ? { lastActiveFamilyTabId: id } : {}),
    }),
  setDeleteFocus: (focus) => set({ deleteFocus: focus }),
  createFamily: (unionIds = [], personIds = []) => {
    const s = get();
    const record = createNewFamilyRecord(unionIds, personIds, true);
    const groups = [...s.families.map(({ memberPersonIds: _m, ...r }) => r), record].map((r) =>
      toFamilyGroup(r, s.nodes, s.edges)
    );
    assignAutoFamilyNames(groups, s.nodes);
    set({
      families: groups,
      activeFamilyTabId: record.id,
      lastActiveFamilyTabId: record.id,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    ensureDefaultDocumentsImpl(get, set);
    return record.id;
  },
  deleteFamily: (familyId) => {
    const s = get();
    const remaining = s.families.filter((f) => f.id !== familyId);
    set({
      families: remaining,
      activeFamilyTabId: s.activeFamilyTabId === familyId ? null : s.activeFamilyTabId,
      lastActiveFamilyTabId:
        s.lastActiveFamilyTabId === familyId ? null : s.lastActiveFamilyTabId,
      documents: s.documents.filter((d) => d.familyId !== familyId),
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    reconcileFamiliesImpl(get, set);
    ensureDefaultDocumentsImpl(get, set);
  },
  moveNodesToFamily: (nodeIds, familyId) => {
    const s = get();
    const records = s.families.map(({ memberPersonIds: _m, ...r }) => ({
      ...r,
      personIds: [...(r.personIds ?? [])],
    }));
    const target = records.find((f) => f.id === familyId);
    if (!target) return;
    for (const id of nodeIds) {
      const node = s.nodes.find((n) => n.id === id);
      if (!node) continue;
      for (const f of records) {
        if (f.id === familyId) continue;
        f.unionIds = f.unionIds.filter((uid) => uid !== id);
        f.personIds = f.personIds!.filter((pid) => pid !== id);
      }
      if (node.data.kind === "union") {
        if (!target.unionIds.includes(id)) {
          target.unionIds = [...target.unionIds, id].sort();
        }
      } else if (!target.personIds!.includes(id)) {
        target.personIds = [...target.personIds!, id].sort();
      }
    }
    const updated = records.map((r) => toFamilyGroup(r, s.nodes, s.edges));
    set({ families: updated, hasUnsavedChanges: true, lastSaveError: null });
    stripNodeDeclarationsImpl(get, set, nodeIds);
    appendNodeDeclarationToDocumentImpl(get, set, familyId, nodeIds);
    ensureDefaultDocumentsImpl(get, set);
  },
  transferUnionsToNewFamily: (unionIds, sourceFamilyId, restrictPersonIds) => {
    const s = get();
    const sourceFamily = s.families.find((f) => f.id === sourceFamilyId);
    if (!sourceFamily) return null;
    const restrictSet = restrictPersonIds ? new Set(restrictPersonIds) : null;
    const sets = computeUnionTransferSets(
      unionIds,
      sourceFamily,
      s.nodes,
      s.edges,
      restrictSet
    );
    if (!sets) return null;
    const { filteredUnionIds, stayingUnions, movingPersons, newEdges, nextNodes } = sets;
    const updatedRecords = s.families.map((f) => {
      const { memberPersonIds: _mp, ...record } = f;
      if (f.id !== sourceFamilyId) return record;
      return {
        ...record,
        unionIds: stayingUnions,
        personIds: (record.personIds ?? []).filter((pid) => !movingPersons.has(pid)),
      };
    });
    const newRecord = createNewFamilyRecord(filteredUnionIds, [...movingPersons], true);
    const newGroups = [...updatedRecords, newRecord].map((r) =>
      toFamilyGroup(r, nextNodes, newEdges)
    );
    assignAutoFamilyNames(newGroups, nextNodes);
    const newFamilyId = newRecord.id;
    const opts = getScriptGenOptions(s);
    const scopeIds = new Set<string>([...filteredUnionIds, ...movingPersons]);
    for (const uid of filteredUnionIds) {
      for (const mid of getUnionFamilyMemberIds(uid, nextNodes, newEdges)) {
        if (movingPersons.has(mid)) scopeIds.add(mid);
      }
    }
    const newFamily = newGroups.find((f) => f.id === newFamilyId)!;
    const suffix = nextDocumentSuffix(
      s.documents.filter((d) => d.familyId === newFamilyId).map((d) => d.name),
      newFamily.name
    );
    const newDoc: FamilyTreeDocumentRecord = {
      id: generateId(),
      name: formatMainDocumentName(newFamily.name, suffix),
      familyId: newFamilyId,
      role: "main",
      content: generateFamilyTreeScript(nextNodes, newEdges, { ...opts, scopeNodeIds: scopeIds }),
      updatedAt: Date.now(),
      autoNamed: true,
      nameSuffix: suffix,
    };
    set({
      families: newGroups,
      nodes: nextNodes,
      edges: newEdges,
      activeFamilyTabId: newFamilyId,
      lastActiveFamilyTabId: newFamilyId,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    stripNodeDeclarationsImpl(get, set, [...scopeIds]);
    set({
      documents: [...get().documents, newDoc],
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    ensureDefaultDocumentsImpl(get, set);
    return newFamilyId;
  },
  transferUnionsToFamily: (unionIds, sourceFamilyId, targetFamilyId, restrictPersonIds) => {
    const s = get();
    if (sourceFamilyId === targetFamilyId) return;
    const sourceFamily = s.families.find((f) => f.id === sourceFamilyId);
    const targetFamily = s.families.find((f) => f.id === targetFamilyId);
    if (!sourceFamily || !targetFamily) return;
    const restrictSet = restrictPersonIds ? new Set(restrictPersonIds) : null;
    const sets = computeUnionTransferSets(
      unionIds,
      sourceFamily,
      s.nodes,
      s.edges,
      restrictSet
    );
    if (!sets) return;
    const { filteredUnionIds, stayingUnions, movingPersons, newEdges, nextNodes } = sets;
    const updatedFamilies = s.families.map((f) => {
      const { memberPersonIds: _mp, ...record } = f;
      if (f.id === sourceFamilyId) {
        return toFamilyGroup(
          {
            ...record,
            unionIds: stayingUnions,
            personIds: (record.personIds ?? []).filter((pid) => !movingPersons.has(pid)),
          },
          nextNodes,
          newEdges
        );
      }
      if (f.id === targetFamilyId) {
        return toFamilyGroup(
          {
            ...record,
            unionIds: [...new Set([...record.unionIds, ...filteredUnionIds])].sort(),
            personIds: [...new Set([...(record.personIds ?? []), ...movingPersons])].sort(),
          },
          nextNodes,
          newEdges
        );
      }
      return toFamilyGroup(record, nextNodes, newEdges);
    });
    set({
      families: updatedFamilies,
      nodes: nextNodes,
      edges: newEdges,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    const movedIds = [...filteredUnionIds, ...movingPersons];
    stripNodeDeclarationsImpl(get, set, movedIds);
    appendNodeDeclarationToDocumentImpl(get, set, targetFamilyId, movedIds);
    ensureDefaultDocumentsImpl(get, set);
  },
  setPersonAnchored: (personId, anchored) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === personId && (n.data as PersonNodeData).kind === "person"
          ? { ...n, data: { ...n.data, anchored } }
          : n
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  setPersonGender: (personId, gender) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === personId && (n.data as PersonNodeData).kind === "person"
          ? {
              ...n,
              data: {
                ...(n.data as PersonNodeData),
                gender: gender ?? undefined,
              },
            }
          : n
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  setPersonGenAnchorLocked: (personId, locked) =>
    set((s) => {
      const node = s.nodes.find(
        (n) => n.id === personId && (n.data as PersonNodeData).kind === "person"
      );
      if (!node) return {};
      const d = node.data as PersonNodeData;
      if (!locked) {
        return {
          nodes: s.nodes.map((n) =>
            n.id === personId && (n.data as PersonNodeData).kind === "person"
              ? {
                  ...n,
                  data: { ...(n.data as PersonNodeData), genAnchorLocked: undefined },
                }
              : n
          ),
          hasUnsavedChanges: true,
          lastSaveError: null,
        };
      }
      const h = s.nodeSizesById[personId]?.height ?? DEFAULT_PERSON_H;
      const centerY = node.position.y + h / 2;
      const effectiveId =
        d.genAnchorId ?? getAnchorAtY(s.generationAnchors, centerY)?.id ?? null;
      if (!effectiveId) return {};
      return {
        nodes: s.nodes.map((n) =>
          n.id === personId && (n.data as PersonNodeData).kind === "person"
            ? {
                ...n,
                data: {
                  ...(n.data as PersonNodeData),
                  genAnchorId: effectiveId,
                  genAnchorLocked: true,
                },
              }
            : n
        ),
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    }),
  addCustomParentRole: (label) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (lower === "child") return;
    if ((BUILT_IN_PARENT_ROLES as readonly string[]).includes(lower)) return;
    set((s) => {
      if (s.customParentRoles.some((r) => r.toLowerCase() === lower)) return {};
      return {
        customParentRoles: [...s.customParentRoles, trimmed],
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    });
  },
  addCustomGender: (label) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if ((BUILT_IN_GENDERS as readonly string[]).includes(lower)) return;
    set((s) => {
      if (s.customGenders.some((g) => g.toLowerCase() === lower)) return {};
      return {
        customGenders: [...s.customGenders, trimmed],
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    });
  },
  addCustomChildRole: (label) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if ((BUILT_IN_CHILD_ROLES as readonly string[]).includes(lower)) return;
    set((s) => {
      if (s.customChildRoles.some((r) => r.toLowerCase() === lower)) return {};
      return {
        customChildRoles: [...s.customChildRoles, trimmed],
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    });
  },
  setIsolationModeActive: (v) => set({ isolationModeActive: v }),
  setPendingFocusFamilyId: (id) => set({ pendingFocusFamilyId: id }),
  setInspectorFamilyId: (id) => set({ inspectorFamilyId: id, inspectorBranchId: id != null ? null : get().inspectorBranchId }),
  setBranchToolActive: (v) => set({ branchToolActive: v }),
  setActiveBranchTabId: (id) => set({ activeBranchTabId: id }),
  setInspectorBranchId: (id) => set({ inspectorBranchId: id, inspectorFamilyId: id != null ? null : get().inspectorFamilyId }),
  setPendingFocusBranchId: (id) => set({ pendingFocusBranchId: id }),
  toggleHideForPerson: (personId) => {
    const s = get();
    const existingHidden = s.branches.find((b) => b.rootPersonId === personId && b.mode === "hidden");
    if (existingHidden) {
      set({
        branches: s.branches.filter((b) => b.id !== existingHidden.id),
        hasUnsavedChanges: true,
        lastSaveError: null,
      });
      return;
    }
    if (!canBranchFromPerson(personId, s.nodes, s.edges)) return;
    if (s.branches.some((b) => b.rootPersonId === personId && b.mode === "tab")) return;

    const personNode = s.nodes.find((n) => n.id === personId);
    const personName = personNode
      ? getPersonDisplayName(personNode.data as PersonNodeData, personId, s.nodes)
      : "Person";
    const branch: BranchRecord = {
      id: generateBranchId(),
      name: `${personName} (hidden)`,
      description: "",
      mode: "hidden",
      rootPersonId: personId,
      familyId: findFamilyIdForPerson(personId, s.families, s.nodes, s.edges),
      createdAt: Date.now(),
    };
    set({ branches: [...s.branches, branch], hasUnsavedChanges: true, lastSaveError: null });
  },
  createOrConvertBranchTab: (personId) => {
    const s = get();
    const existingTab = s.branches.find((b) => b.rootPersonId === personId && b.mode === "tab");
    if (existingTab) {
      set({
        activeBranchTabId: existingTab.id,
        pendingFocusBranchId: existingTab.id,
        inspectorBranchId: null,
        inspectorFamilyId: null,
      });
      return;
    }
    if (!canBranchFromPerson(personId, s.nodes, s.edges)) return;

    const personNode = s.nodes.find((n) => n.id === personId);
    const personName = personNode
      ? getPersonDisplayName(personNode.data as PersonNodeData, personId, s.nodes)
      : "Person";
    const hidden = s.branches.find((b) => b.rootPersonId === personId && b.mode === "hidden");
    if (hidden) {
      const converted: BranchRecord = {
        ...hidden,
        mode: "tab",
        name: `${personName}'s Branch`,
      };
      set({
        branches: s.branches.map((b) => (b.id === hidden.id ? converted : b)),
        activeBranchTabId: hidden.id,
        pendingFocusBranchId: hidden.id,
        inspectorBranchId: null,
        inspectorFamilyId: null,
        hasUnsavedChanges: true,
        lastSaveError: null,
      });
      return;
    }

    const branch: BranchRecord = {
      id: generateBranchId(),
      name: `${personName}'s Branch`,
      description: "",
      mode: "tab",
      rootPersonId: personId,
      familyId: findFamilyIdForPerson(personId, s.families, s.nodes, s.edges),
      createdAt: Date.now(),
    };
    set({
      branches: [...s.branches, branch],
      activeBranchTabId: branch.id,
      pendingFocusBranchId: branch.id,
      inspectorBranchId: null,
      inspectorFamilyId: null,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
  },
  setBranchCustomName: (branchId, name) => {
    const s = get();
    const trimmed = name.trim();
    set({
      branches: s.branches.map((b) =>
        b.id === branchId ? { ...b, name: trimmed || b.name } : b
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
  },
  setBranchDescription: (branchId, description) => {
    const s = get();
    set({
      branches: s.branches.map((b) => (b.id === branchId ? { ...b, description } : b)),
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
  },
  deleteBranch: (branchId) => {
    const s = get();
    set({
      branches: s.branches.filter((b) => b.id !== branchId),
      activeBranchTabId: s.activeBranchTabId === branchId ? null : s.activeBranchTabId,
      inspectorBranchId: s.inspectorBranchId === branchId ? null : s.inspectorBranchId,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
  },
  setFamilyCustomName: (familyId, name) => {
    const s = get();
    const trimmed = name.trim();
    set({
      families: s.families.map((f) =>
        f.id === familyId
          ? {
              ...f,
              name: trimmed || f.name,
              isCustomName: !!trimmed,
            }
          : f
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    resyncAutoDocumentNamesImpl(get, set);
    reconcileFamiliesImpl(get, set);
  },
  setFamilyDescription: (familyId, description) => {
    const s = get();
    set({
      families: s.families.map((f) => (f.id === familyId ? { ...f, description } : f)),
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
  },
  setFamilyNotes: (familyId, notes) => {
    const s = get();
    set({
      families: s.families.map((f) => (f.id === familyId ? { ...f, notes } : f)),
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
  },
  setFamilyColor: (familyId, color) => {
    const s = get();
    set({
      families: s.families.map((f) =>
        f.id === familyId ? { ...f, color: color ?? undefined } : f
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
  },
  requestRemoveConnection: (target) => {
    const s = get();
    const affectedUnionIds = getUnionIdsFromTarget(target, s.edges);
    if (affectedUnionIds.length === 0 && target.kind !== "person") {
      return "Connection not found.";
    }

    const simulated = simulateRemoval(target, s.nodes, s.edges);
    const affectedFamilies = s.families.filter((f) =>
      f.unionIds.some((uid) => affectedUnionIds.includes(uid))
    );

    for (const family of affectedFamilies) {
      const crownedId = family.unionIds.find(
        (uid) => (s.nodes.find((n) => n.id === uid)?.data as UnionNodeData)?.isMainGraph
      );
      if (!crownedId) continue;
      if (target.kind === "union" && target.unionId === crownedId) continue;
      const componentsBefore = computeComponentsForUnionSubset(
        family.unionIds,
        s.nodes,
        s.edges
      );
      const crownedComponent = componentsBefore.find((c) => c.includes(crownedId)) ?? [crownedId];
      if (!affectedUnionIds.some((uid) => crownedComponent.includes(uid))) continue;
      const componentsAfter = computeComponentsForUnionSubset(
        crownedComponent,
        simulated.nodes,
        simulated.edges
      );
      if (componentsAfter.length >= 2) {
        set({
          pendingBloodlineWarning: {
            target,
            familyId: family.id,
            familyName: family.name,
            crownedComponentUnionIds: crownedComponent,
          },
        });
        return null;
      }
    }

    const err = applyRemoveConnectionInternal(get, target);
    if (err) return err;

    const shouldToast = affectedFamilies.some((f) => f.parentFamilyIds);
    if (shouldToast) {
      const family = affectedFamilies.find((f) => f.parentFamilyIds);
      if (family?.parentFamilyIds) {
        const [aId, bId] = family.parentFamilyIds;
        const parentA = s.families.find((f) => f.id === aId);
        const parentB = s.families.find((f) => f.id === bId);
        const msg =
          parentA && parentB
            ? `${parentA.name} and ${parentB.name} are still connected via another link`
            : "Families are still connected via another link";
        showFamilyConnectionNotice(set, msg);
      }
    }

    reconcileFamiliesImpl(get, set);
    return null;
  },
  resolveBloodlineWarning: (choice) => {
    const s = get();
    const warning = s.pendingBloodlineWarning;
    if (!warning) return;

    set({ pendingBloodlineWarning: null });

    const err = applyRemoveConnectionInternal(get, warning.target);
    if (err) {
      alert(err);
      return;
    }

    const s2 = get();
    const family = s2.families.find((f) => f.id === warning.familyId);
    if (family?.parentFamilyIds) {
      const stripped = stripUnifiedFamilyOverlap(
        s2.families,
        family.id,
        s2.nodes,
        s2.edges
      );
      set({ families: stripped, hasUnsavedChanges: true, lastSaveError: null });
    }

    if (choice === "deleteDescendants" && family) {
      const crownedId = family.unionIds.find(
        (uid) => (get().nodes.find((n) => n.id === uid)?.data as UnionNodeData)?.isMainGraph
      );
      const remainingIds = warning.crownedComponentUnionIds.filter((uid) =>
        get().nodes.some((n) => n.id === uid)
      );
      if (crownedId && remainingIds.includes(crownedId)) {
        const componentsAfter = computeComponentsForUnionSubset(
          remainingIds,
          get().nodes,
          get().edges
        );
        const surviving = componentsAfter.find((c) => c.includes(crownedId)) ?? [];
        const orphanUnionIds = remainingIds.filter((uid) => !surviving.includes(uid));
        if (orphanUnionIds.length > 0) {
          get().removeNodes(
            getFamilyMemberNodeIds(orphanUnionIds, get().nodes, get().edges)
          );
        }
      }
    }

    reconcileFamiliesImpl(get, set);
  },
  requestDeleteSelection: () => {
    const s = get();
    const focusIsFamily = s.deleteFocus === "family" || s.selectedNodeIds.length === 0;
    if (focusIsFamily && s.activeFamilyTabId != null) {
      set({ pendingDeleteConfirm: { kind: "family", familyId: s.activeFamilyTabId } });
      return;
    }
    if (focusIsFamily || s.selectedNodeIds.length === 0) return;
    const ids = s.selectedNodeIds;
    const kinds = ids.map(
      (id) => (s.nodes.find((n) => n.id === id)?.data as { kind?: string })?.kind
    );
    const personCount = kinds.filter((k) => k === "person").length;
    const unionCount = kinds.filter((k) => k === "union").length;
    if (personCount > 1 || unionCount >= 1) {
      set({ pendingDeleteConfirm: { kind: "nodes", nodeIds: ids } });
    } else {
      get().performDeleteNodes(ids);
    }
  },
  performDeleteNodes: (ids) => {
    for (const id of ids) {
      const node = get().nodes.find((n) => n.id === id);
      const kind = (node?.data as { kind?: string })?.kind;
      const target =
        kind === "union"
          ? ({ kind: "union" as const, unionId: id })
          : ({ kind: "person" as const, personId: id });
      const err = get().requestRemoveConnection(target);
      if (err) alert(err);
      if (get().pendingBloodlineWarning) break;
    }
  },
  confirmPendingDelete: () => {
    const pending = get().pendingDeleteConfirm;
    if (!pending) return;
    set({ pendingDeleteConfirm: null });
    if (pending.kind === "family") {
      const family = get().families.find((f) => f.id === pending.familyId);
      if (family) {
        get().removeNodes(getFamilyVisibleNodeIds(family, get().nodes, get().edges));
        get().deleteFamily(pending.familyId);
      }
      return;
    }
    get().performDeleteNodes(pending.nodeIds);
  },
  cancelPendingDelete: () => set({ pendingDeleteConfirm: null }),

  requestClearFamily: (familyId) => set({ pendingClearFamilyConfirm: familyId }),
  confirmClearFamily: () => {
    const familyId = get().pendingClearFamilyConfirm;
    if (!familyId) return;
    set({ pendingClearFamilyConfirm: null });
    get().clearFamilyNodes(familyId);
  },
  cancelClearFamily: () => set({ pendingClearFamilyConfirm: null }),
  clearFamilyNodes: (familyId) => {
    const s = get();
    const family = s.families.find((f) => f.id === familyId);
    if (!family) return;
    const ids = getFamilyVisibleNodeIds(family, s.nodes, s.edges);
    stripNodeDeclarationsImpl(get, set, ids);
    get().removeNodes(ids);
    const record: PersistedFamilyRecord = {
      id: family.id,
      unionIds: [],
      personIds: [],
      explicit: true,
      name: family.name,
      isCustomName: family.isCustomName,
      description: family.description,
      parentFamilyIds: family.parentFamilyIds,
    };
    set({
      families: s.families.map((f) =>
        f.id === familyId ? toFamilyGroup(record, get().nodes, get().edges) : f
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    reconcileFamiliesImpl(get, set);
    ensureDefaultDocumentsImpl(get, set);
  },

  resolveAnchorTransferWarning: (choice) => {
    const pending = get().pendingAnchorTransferWarning;
    if (!pending) return;
    set({ pendingAnchorTransferWarning: null });
    if (choice === "cancel") return;
    if (pending.reducedUnionIds.length > 0) {
      get().transferUnionsToFamily(
        pending.reducedUnionIds,
        pending.sourceFamilyId,
        pending.targetFamilyId
      );
    }
    get().placeNodeAt(pending.nodeId, pending.position);
  },

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
  setStyleEditorOpenUnionId: (id) => set({ styleEditorOpenUnionId: id }),
  setScriptCompactDeclarations: (v) => set({ scriptCompactDeclarations: v }),
  setShowGenerationAnchors: (v) =>
    set({ showGenerationAnchors: v, hasUnsavedChanges: true, lastSaveError: null }),
  setShowGenInheritIndicator: (v) =>
    set({ showGenInheritIndicator: v, hasUnsavedChanges: true, lastSaveError: null }),
  setGenAnchorBandOpacity: (v) =>
    set({ genAnchorBandOpacity: Math.min(100, Math.max(0, v)), hasUnsavedChanges: true, lastSaveError: null }),
  setGenAnchorLineOpacity: (v) =>
    set({ genAnchorLineOpacity: Math.min(100, Math.max(0, v)), hasUnsavedChanges: true, lastSaveError: null }),
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
  setEdgeConnectionStyleId: (edgeId, styleId) =>
    set((s) => ({
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const d = { ...(e.data as FamilyTreeEdgeData) };
        return {
          ...e,
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
  setEdgeConnectionStyleOverride: (edgeId, style) =>
    set((s) => ({
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const d = { ...(e.data as FamilyTreeEdgeData) };
        return {
          ...e,
          data: {
            ...d,
            connectionStyleOverride: style,
          },
        };
      }),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  clearEdgeConnectionStyle: (edgeId) =>
    set((s) => ({
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const d = { ...(e.data as FamilyTreeEdgeData) };
        delete d.connectionStyleId;
        delete d.connectionStyleOverride;
        return { ...e, data: d };
      }),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  setUnionFamilyLocked: (unionId, locked) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== unionId || (n.data as UnionNodeData).kind !== "union") return n;
        return { ...n, data: { ...n.data, familyLocked: locked } };
      }),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  setUnionMainGraph: (unionId, value) =>
    set((s) => {
      const owner = findFamilyForNode(unionId, s.families);
      const siblings = new Set(owner?.unionIds ?? []);
      return {
        nodes: s.nodes.map((n) => {
          if ((n.data as UnionNodeData).kind !== "union") return n;
          if (n.id === unionId) return { ...n, data: { ...n.data, isMainGraph: value } };
          if (value && siblings.has(n.id)) return { ...n, data: { ...n.data, isMainGraph: false } };
          return n;
        }),
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    }),
  setUnionArrangeSpacing: (unionId, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== unionId || (n.data as UnionNodeData).kind !== "union") return n;
        const d = n.data as UnionNodeData;
        return {
          ...n,
          data: {
            ...d,
            arrangeSpacing: { ...(d.arrangeSpacing ?? {}), ...patch },
          },
        };
      }),
      hasUnsavedChanges: true,
      lastSaveError: null,
    })),
  applyAverageParentSpacing: (unionId) => {
    const gap = getUnionParentGap(unionId, get().nodes);
    const resolved = resolveUnionPartners(unionId, get().nodes);
    if (gap == null || !resolved) return false;
    get().setUnionArrangeSpacing(unionId, { parentSpacing: gap });
    return applyAverageParentSpacingImpl(get, unionId);
  },
  applyAverageChildSpacing: (unionId) => {
    const children = getUnionDirectChildren(unionId, get().nodes, get().edges);
    if (children.length < 2) return false;
    const gap = getUnionChildrenAvgGap(unionId, get().nodes, get().edges);
    if (gap == null) return false;
    get().setUnionArrangeSpacing(unionId, { childSpacing: gap });
    return applyAverageChildSpacingImpl(get, unionId);
  },
  applyAverageVerticalSpacing: (unionId) => {
    const gap = getUnionVerticalGap(unionId, get().nodes, get().edges);
    if (gap == null) return false;
    get().setUnionArrangeSpacing(unionId, { verticalSpacing: gap });
    return applyAverageVerticalSpacingImpl(get, unionId);
  },
  applyParentAlignment: (unionId, alignment) => {
    get().setUnionArrangeSpacing(unionId, { parentAlignment: alignment });
    return applyParentAlignmentImpl(get, unionId, alignment);
  },
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
  setLegendMode: (v) => set({ legendMode: v, hasUnsavedChanges: true, lastSaveError: null }),
  setSubEntitySelectionMode: (mode) =>
    set({ subEntitySelectionMode: mode, hasUnsavedChanges: true, lastSaveError: null }),
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
  setViewportBounds: (bounds) => set({ viewportBounds: bounds }),
  reportNodeSize: (nodeId, size) =>
    set((s) => {
      const prev = s.nodeSizesById[nodeId];
      if (
        prev &&
        Math.round(prev.width) === Math.round(size.width) &&
        Math.round(prev.height) === Math.round(size.height)
      ) {
        return s;
      }
      return {
        nodeSizesById: {
          ...s.nodeSizesById,
          [nodeId]: { width: size.width, height: size.height },
        },
      };
    }),

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
      const pinned = s.primarySelectionPinnedId;
      const keepPin = pinned != null && ids.includes(pinned);
      return {
        selectedNodeIds: ids,
        primarySelectedNodeId: keepPin ? pinned : ids[0] ?? null,
        primarySelectionPinnedId: keepPin ? pinned : null,
        ...(ids.length > 0 ? { deleteFocus: "nodes" as const } : {}),
      };
    }),

  setSelectionWithPrimary: (ids, primaryId) =>
    set({
      selectedNodeIds: ids,
      primarySelectedNodeId: primaryId,
      primarySelectionPinnedId: primaryId,
      ...(ids.length > 0 ? { deleteFocus: "nodes" as const } : {}),
    }),

  addPerson: (options) => {
    const id = generateId();
    const state = get();
    const { nodes, viewportBounds, snapToGrid, generationAnchors, genLabelMode, showGenInheritIndicator } = state;
    const genAnchorId = options?.genAnchorId;
    const anchor = genAnchorId ? generationAnchors.find((a) => a.id === genAnchorId) : null;

    const tryPosition = (x: number, y: number) =>
      snapToGrid ? snapPosition(x, y, true) : { x, y };

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
    const familyId = ensureActiveFamilyTarget(get, set);
    const nextNodes = [...state.nodes, newNode];
    const updatedFamilies = appendNodeToFamilyRecord(
      get().families,
      familyId,
      id,
      "person",
      nextNodes,
      state.edges
    );
    set({
      nodes: nextNodes,
      families: updatedFamilies,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    appendNodeDeclarationToDocumentImpl(get, set, familyId, id);

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
    const unionNum = nextUnionNumber(state.nodes);
    const [leftId, rightId] =
      nodeA.position.x <= nodeB.position.x ? [idA, idB] : [idB, idA];
    const midX = (nodeA.position.x + nodeB.position.x) / 2;
    const belowY = Math.max(nodeA.position.y, nodeB.position.y) + 70;
    const familyId = ensureActiveFamilyTarget(get, set);
    const family = get().families.find((f) => f.id === familyId);
    const hasMainGraph =
      family?.unionIds.some(
        (uid) => (get().nodes.find((n) => n.id === uid)?.data as UnionNodeData)?.isMainGraph
      ) ?? false;
    const unionNode: Node<UnionNodeData> = {
      id: unionId,
      type: "union",
      position: { x: midX - 30, y: belowY },
      data: {
        kind: "union",
        name: `Union ${unionNum}`,
        partnerIds: [idA, idB],
        leftPartnerId: leftId,
        rightPartnerId: rightId,
        notes: "",
        unionType: "forward",
        createdAt: Date.now(),
        ...(!hasMainGraph ? { isMainGraph: true } : {}),
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
    const familyIdAfter = ensureActiveFamilyTarget(get, set);
    const after = get();
    const updatedFamilies = appendNodeToFamilyRecord(
      after.families,
      familyIdAfter,
      unionId,
      "union",
      after.nodes,
      after.edges
    );
    set({ families: updatedFamilies });
    appendNodeDeclarationToDocumentImpl(get, set, familyIdAfter, unionId);
    return unionId;
  },

  createFullUnion: (options) => {
    const state = get();
    const settings = state.fullUnionSettings;
    const seedPersonIds = options?.seedPersonIds ?? [];
    const { nodes, snapToGrid, viewportBounds } = state;

    const seedNodes = seedPersonIds
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is Node<PersonNodeData> => n != null && n.type === "person");
    if (seedNodes.length !== seedPersonIds.length) return null;

    const snap = (x: number, y: number) => snapPosition(x, y, snapToGrid);

    const newNodes: Node<FamilyTreeNodeData>[] = [];
    const newEdges: Edge[] = [];
    let personNumOffset = nextPersonNumber(nodes);
    const personPatches = new Map<string, Partial<PersonNodeData>>();

    const patchPerson = (personId: string, patch: Partial<PersonNodeData>) => {
      const prev = personPatches.get(personId) ?? {};
      personPatches.set(personId, { ...prev, ...patch });
    };

    const makeNewPerson = (
      x: number,
      y: number,
      opts?: { gender?: string }
    ): string => {
      const id = generateId();
      const name = `Person ${personNumOffset}`;
      personNumOffset += 1;
      const node = makeNewPersonNode(id, name, snap(x, y));
      if (opts?.gender) {
        node.data = { ...node.data, gender: opts.gender };
      }
      newNodes.push(node);
      return id;
    };

    const unionId = generateId();
    const unionNum = nextUnionNumber(nodes);

    if (settings.advancedEnabled) {
      const MAX_PARTNERS = 12;
      const parentSpecs =
        settings.parents.length > 0 ? settings.parents : [{ role: undefined, gender: undefined }];
      const slotCount = Math.min(parentSpecs.length, MAX_PARTNERS);
      if (seedPersonIds.length > slotCount) return null;

      const sortedSeeds = [...seedNodes].sort((a, b) => a.position.x - b.position.x);
      const n = slotCount;

      let unionCenterX: number;
      let unionY: number;

      if (sortedSeeds.length > 0) {
        unionCenterX =
          sortedSeeds.reduce((sum, node) => sum + node.position.x, 0) / sortedSeeds.length;
        unionY = Math.max(...sortedSeeds.map((node) => node.position.y)) + UNION_DY;
      } else if (viewportBounds) {
        unionCenterX = (viewportBounds.minX + viewportBounds.maxX) / 2;
        unionY = (viewportBounds.minY + viewportBounds.maxY) / 2;
      } else {
        const maxY = nodes.reduce((max, node) => Math.max(max, node.position.y), 0);
        unionCenterX = 100 + DEFAULT_UNION_W / 2;
        unionY = maxY + 80;
      }

      const unionX = unionCenterX - DEFAULT_UNION_W / 2;
      const partnerSlots: UnionPartnerSlot[] = [];

      for (let i = 0; i < slotCount; i += 1) {
        const spec = parentSpecs[i] ?? {};
        let role: ParentRole | undefined = spec.role || undefined;
        let gender: string | undefined = spec.gender || undefined;
        const px = unionCenterX + (i - (n - 1) / 2) * PARTNER_DX;
        const py = unionY - UNION_DY;

        let personId: string;
        if (i < sortedSeeds.length) {
          personId = sortedSeeds[i]!.id;
          const existing = sortedSeeds[i]!.data as PersonNodeData;
          if (!role) {
            const seedRole = getPersonParentRole(personId, nodes);
            if (seedRole) role = seedRole;
          }
          if (gender && !existing.gender) patchPerson(personId, { gender });
        } else {
          if (
            sortedSeeds.length === 1 &&
            settings.autoAssignMissingPartner &&
            !role
          ) {
            const seedRole = getPersonParentRole(sortedSeeds[0]!.id, nodes);
            if (seedRole) {
              role = oppositeParentRole(seedRole);
              if (role && !gender) gender = genderForParentRole(role) ?? undefined;
            }
          } else if (!gender && role) {
            gender = genderForParentRole(role) ?? undefined;
          }
          personId = makeNewPerson(px, py, gender ? { gender } : undefined);
        }

        if (role === "unknown") {
          patchPerson(personId, {
            firstName: "Unknown",
            middleName: "",
            lastName: "",
            name: "Unknown",
          });
        } else if (role && !gender) {
          const mapped = genderForParentRole(role);
          const existingGender = (
            nodes.find((node) => node.id === personId)?.data as PersonNodeData | undefined
          )?.gender;
          if (mapped && !existingGender) patchPerson(personId, { gender: mapped });
        }

        partnerSlots.push({ personId, ...(role ? { role } : {}) });
      }

      const childSpecs = settings.children;
      const childIds: string[] = [];
      for (let i = 0; i < childSpecs.length; i += 1) {
        const spec = childSpecs[i] ?? {};
        const childId = makeNewPerson(
          unionX + i * DEFAULT_CHILD_ROW_SPACING,
          unionY + CHILD_DY,
          spec.gender ? { gender: spec.gender } : undefined
        );
        childIds.push(childId);
      }

      const familyId = ensureActiveFamilyTarget(get, set);
      const family = get().families.find((f) => f.id === familyId);
      const hasMainGraph =
        family?.unionIds.some(
          (uid) =>
            (get().nodes.find((node) => node.id === uid)?.data as UnionNodeData)?.isMainGraph
        ) ?? false;

      const unionData = withUnionPartners(
        {
          kind: "union",
          name: `Union ${unionNum}`,
          partnerIds: [null, null],
          notes: "",
          unionType: partnerSlots.length > 0 ? "forward" : "backward",
          createdAt: Date.now(),
          ...(!hasMainGraph ? { isMainGraph: true } : {}),
        },
        partnerSlots
      );

      newNodes.push({
        id: unionId,
        type: "union",
        position: snap(unionX, unionY),
        data: unionData,
      });

      partnerSlots.forEach((slot, index) => {
        newEdges.push({
          id: `e-${slot.personId}-${unionId}`,
          source: slot.personId,
          target: unionId,
          sourceHandle: "partner",
          targetHandle: `partner-${index}`,
          data: { type: "partner" },
        });
      });

      childIds.forEach((childId, index) => {
        const childRole = childSpecs[index]?.childRole;
        newEdges.push({
          id: `e-${unionId}-${childId}`,
          source: unionId,
          target: childId,
          sourceHandle: "children",
          targetHandle: "parent",
          data: {
            type: "child",
            ...(childRole ? { childRole } : {}),
          },
        });
      });

      set((s) => ({
        nodes: [
          ...s.nodes.map((node) => {
            const patch = personPatches.get(node.id);
            if (!patch) return node;
            return {
              ...node,
              data: { ...(node.data as PersonNodeData), ...patch } as FamilyTreeNodeData,
            };
          }),
          ...newNodes,
        ],
        edges: [...s.edges, ...newEdges],
        selectedNodeIds: [unionId],
        primarySelectedNodeId: unionId,
        hasUnsavedChanges: true,
        lastSaveError: null,
      }));

      const familyIdAfter = ensureActiveFamilyTarget(get, set);
      const after = get();
      let updatedFamilies = after.families;
      const allNewPersonIds = newNodes
        .filter((node) => node.type === "person")
        .map((node) => node.id);

      updatedFamilies = appendNodeToFamilyRecord(
        updatedFamilies,
        familyIdAfter,
        unionId,
        "union",
        after.nodes,
        after.edges
      );
      for (const pid of allNewPersonIds) {
        updatedFamilies = appendNodeToFamilyRecord(
          updatedFamilies,
          familyIdAfter,
          pid,
          "person",
          after.nodes,
          after.edges
        );
      }
      set({ families: updatedFamilies });

      appendNodeDeclarationToDocumentImpl(get, set, familyIdAfter, [
        unionId,
        ...allNewPersonIds,
      ]);
      return unionId;
    }

    if (seedPersonIds.length > 2) return null;

    let leftId: string | null = null;
    let rightId: string | null = null;
    let leftRole: ParentRole | undefined;
    let rightRole: ParentRole | undefined;

    let unionX: number;
    let unionY: number;

    if (seedNodes.length === 2) {
      const [nodeA, nodeB] = seedNodes;
      const [leftNode, rightNode] =
        nodeA.position.x <= nodeB.position.x ? [nodeA, nodeB] : [nodeB, nodeA];
      leftId = leftNode.id;
      rightId = rightNode.id;
      const midX = (leftNode.position.x + rightNode.position.x) / 2;
      unionX = midX - DEFAULT_UNION_W / 2;
      unionY = Math.max(leftNode.position.y, rightNode.position.y) + UNION_DY;
    } else if (seedNodes.length === 1) {
      const seed = seedNodes[0]!;
      leftId = seed.id;
      const seedRole = getPersonParentRole(seed.id, nodes);
      const { includeFather, includeMother } = settings;

      if (!includeFather && !includeMother) {
        if (seedRole) leftRole = seedRole;
      } else if (includeFather && includeMother) {
        rightId = makeNewPerson(seed.position.x + PARTNER_DX, seed.position.y);
        leftRole = undefined;
        rightRole = seedRole ? oppositeParentRole(seedRole) : undefined;
      } else {
        const checkedRole: ParentRole = includeFather ? "father" : "mother";
        rightId = makeNewPerson(seed.position.x + PARTNER_DX, seed.position.y);
        leftRole = seedRole ?? undefined;
        rightRole = checkedRole;
      }

      unionX = rightId != null ? seed.position.x + PARTNER_DX / 2 : seed.position.x;
      unionY = seed.position.y + UNION_DY;
    } else {
      if (viewportBounds) {
        unionX =
          (viewportBounds.minX + viewportBounds.maxX) / 2 - DEFAULT_UNION_W / 2;
        unionY = (viewportBounds.minY + viewportBounds.maxY) / 2;
      } else {
        const maxY = nodes.reduce((max, n) => Math.max(max, n.position.y), 0);
        unionX = 100;
        unionY = maxY + 80;
      }

      const { includeFather, includeMother } = settings;
      if (includeFather && includeMother) {
        leftId = makeNewPerson(unionX - PARTNER_DX / 2, unionY - UNION_DY);
        rightId = makeNewPerson(unionX + PARTNER_DX / 2, unionY - UNION_DY);
        leftRole = "father";
        rightRole = "mother";
      } else if (includeFather) {
        leftId = makeNewPerson(unionX - PARTNER_DX / 2, unionY - UNION_DY);
        leftRole = "father";
      } else if (includeMother) {
        leftId = makeNewPerson(unionX - PARTNER_DX / 2, unionY - UNION_DY);
        leftRole = "mother";
      }
    }

    const childIds: string[] = [];
    if (settings.includeChildren && settings.childCount > 0) {
      for (let i = 0; i < settings.childCount; i += 1) {
        const childId = makeNewPerson(
          unionX + i * DEFAULT_CHILD_ROW_SPACING,
          unionY + CHILD_DY
        );
        childIds.push(childId);
      }
    }

    const partnerSlots: UnionPartnerSlot[] = [];
    if (leftId) partnerSlots.push({ personId: leftId, ...(leftRole ? { role: leftRole } : {}) });
    if (rightId) partnerSlots.push({ personId: rightId, ...(rightRole ? { role: rightRole } : {}) });

    const familyId = ensureActiveFamilyTarget(get, set);
    const family = get().families.find((f) => f.id === familyId);
    const hasMainGraph =
      family?.unionIds.some(
        (uid) =>
          (get().nodes.find((n) => n.id === uid)?.data as UnionNodeData)?.isMainGraph
      ) ?? false;

    const unionData = withUnionPartners(
      {
        kind: "union",
        name: `Union ${unionNum}`,
        partnerIds: [null, null],
        notes: "",
        unionType: partnerSlots.length > 0 ? "forward" : "backward",
        createdAt: Date.now(),
        ...(!hasMainGraph ? { isMainGraph: true } : {}),
      },
      partnerSlots
    );

    newNodes.push({
      id: unionId,
      type: "union",
      position: snap(unionX, unionY),
      data: unionData,
    });

    partnerSlots.forEach((slot, index) => {
      newEdges.push({
        id: `e-${slot.personId}-${unionId}`,
        source: slot.personId,
        target: unionId,
        sourceHandle: "partner",
        targetHandle: `partner-${index}`,
        data: { type: "partner" },
      });
    });
    for (const childId of childIds) {
      newEdges.push({
        id: `e-${unionId}-${childId}`,
        source: unionId,
        target: childId,
        sourceHandle: "children",
        targetHandle: "parent",
        data: { type: "child", childRole: "daughter" },
      });
    }

    set((s) => ({
      nodes: [...s.nodes, ...newNodes],
      edges: [...s.edges, ...newEdges],
      selectedNodeIds: [unionId],
      primarySelectedNodeId: unionId,
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));

    const familyIdAfter = ensureActiveFamilyTarget(get, set);
    const after = get();
    let updatedFamilies = after.families;
    const allNewPersonIds = newNodes
      .filter((n) => n.type === "person")
      .map((n) => n.id);

    updatedFamilies = appendNodeToFamilyRecord(
      updatedFamilies,
      familyIdAfter,
      unionId,
      "union",
      after.nodes,
      after.edges
    );
    for (const pid of allNewPersonIds) {
      updatedFamilies = appendNodeToFamilyRecord(
        updatedFamilies,
        familyIdAfter,
        pid,
        "person",
        after.nodes,
        after.edges
      );
    }
    set({ families: updatedFamilies });

    appendNodeDeclarationToDocumentImpl(get, set, familyIdAfter, [
      unionId,
      ...allNewPersonIds,
    ]);
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
    const familyId = ensureActiveFamilyTarget(get, set);
    const after = get();
    const updatedFamilies = appendNodeToFamilyRecord(
      after.families,
      familyId,
      childId,
      "person",
      after.nodes,
      after.edges
    );
    set({ families: updatedFamilies });
    appendNodeDeclarationToDocumentImpl(get, set, familyId, childId);
    return childId;
  },

  setDefaultUnionType: (t) => set({ defaultUnionType: t }),

  setFullUnionSettings: (patch) =>
    set((s) => {
      const next = { ...s.fullUnionSettings, ...patch };
      if (typeof next.childCount === "number") {
        next.childCount = Math.min(12, Math.max(0, Math.round(next.childCount)));
      }
      if (next.parents && next.parents.length > 12) {
        next.parents = next.parents.slice(0, 12);
      }
      if (next.children && next.children.length > 12) {
        next.children = next.children.slice(0, 12);
      }
      return { fullUnionSettings: next };
    }),

  resetFullUnionSettings: () => set({ fullUnionSettings: { ...DEFAULT_FULL_UNION_SETTINGS } }),

  createBackwardUnion: (childNodeIds) => {
    const state = get();
    const childNodes = childNodeIds
      .map((id) => state.nodes.find((n) => n.id === id))
      .filter((n): n is NonNullable<typeof n> => n != null && n.type === "person");
    if (childNodes.length !== childNodeIds.length) return null;

    const unionId = generateId();
    const unionNum = nextUnionNumber(state.nodes);
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
        name: `Union ${unionNum}`,
        partnerIds: [null, null],
        notes: "",
        unionType: "backward",
        createdAt: Date.now(),
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
    const partners = getUnionPartners(unionData);

    const nextNum = nextPersonNumber(state.nodes);
    const parentId = generateId();
    const unionAboveY = unionNode.position.y;

    let newX = unionNode.position.x;
    let newY = unionAboveY - UNION_DY - DEFAULT_PERSON_H;
    if (partners.length > 0) {
      const existingNodes = partners
        .map((p) => state.nodes.find((n) => n.id === p.personId))
        .filter((n): n is Node<PersonNodeData> => n != null && n.type === "person");
      if (existingNodes.length > 0) {
        newX = Math.max(...existingNodes.map((n) => n.position.x)) + PARTNER_DX;
        newY = existingNodes[0]!.position.y;
      }
    }

    const newPersonNode: Node<PersonNodeData> = {
      id: parentId,
      type: "person",
      position: { x: newX, y: newY },
      data: { kind: "person", name: `Person ${nextNum}`, firstName: `Person ${nextNum}`, middleName: "", lastName: "", notes: "", nicknames: [], isGenArmed: false },
    };

    const newPartners: UnionPartnerSlot[] = [...partners, { personId: parentId }];
    const newData = withUnionPartners(unionData, newPartners);

    const partnerEdge: Edge = {
      id: `e-${parentId}-${unionNodeId}`,
      source: parentId,
      target: unionNodeId,
      sourceHandle: "partner",
      targetHandle: "partners",
      data: { type: "partner" },
    };

    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === unionNodeId ? { ...n, data: newData } : n
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
      if (partnerEdgeExists) return "Person is already a parent of this union.";
      const partners = getUnionPartners(unionData);
      if (partners.some((p) => p.personId === personId)) return "Person is already a parent of this union.";
      const newPartners: UnionPartnerSlot[] = [...partners, { personId }];
      const newData = withUnionPartners(unionData, newPartners);
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
          n.id === unionId ? { ...n, data: newData } : n
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
    const childEdgeData = childEdge.data as FamilyTreeEdgeData | undefined;
    const newChildEdge: Edge = {
      id: `e-${toUnionId}-${childId}`,
      source: toUnionId,
      target: childId,
      sourceHandle: "children",
      targetHandle: "parent",
      data: {
        type: "child",
        ...(childEdgeData?.childRole ? { childRole: childEdgeData.childRole } : {}),
      },
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
    const partners = getUnionPartners(data);
    const partnerIndex = partners.findIndex((p) => p.personId === personId);
    if (partnerIndex === -1) return "Person is not a partner of this union.";
    if (partners.length <= 1) return "Cannot remove the last parent from a union.";
    const newPartners = partners.filter((_, i) => i !== partnerIndex);
    const newData = withUnionPartners(data, newPartners);
    const partnerEdge = state.edges.find(
      (e) => (e.data as { type?: string })?.type === "partner" && e.source === personId && e.target === unionId
    );
    if (!partnerEdge) return "Partner edge not found.";
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === unionId ? { ...n, data: newData } : n
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
      const resolved = isUnknownPlaceholder(name) ? "?" : name;
      const firstName = isUnknownPlaceholder(name) ? "?" : name;
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId && isPersonData(n.data)
            ? {
                ...n,
                data: {
                  ...(n.data as PersonNodeData),
                  name: resolved,
                  firstName,
                  middleName: "",
                  lastName: "",
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
    set((s) => {
      const parts = [f, m, l].filter((p) => p && p !== "?");
      const name = parts.join(" ") || "?";
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId && isPersonData(n.data)
            ? { ...n, data: { ...(n.data as PersonNodeData), firstName: f, middleName: m, lastName: l, name } }
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

  setUnionName: (unionId, name) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === unionId && (n.data as UnionNodeData).kind === "union"
          ? { ...n, data: { ...n.data, name } }
          : n
      ),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
  },

  updateUnionPartnerRole: (unionId, slot, role) => {
    get().updateUnionPartnerRoleAt(unionId, slot === "left" ? 0 : 1, role);
  },

  updateUnionPartnerRoleAt: (unionId, partnerIndex, role) => {
    set((s) => {
      const union = s.nodes.find(
        (n) => n.id === unionId && (n.data as UnionNodeData).kind === "union"
      );
      if (!union) return {};
      const data = union.data as UnionNodeData;
      const partners = getUnionPartners(data);
      if (partnerIndex < 0 || partnerIndex >= partners.length) return {};
      const personId = partners[partnerIndex]!.personId;

      const updatedPartners = partners.map((p, i) => {
        if (i !== partnerIndex) return p;
        if (role) return { personId: p.personId, role };
        return { personId: p.personId };
      });

      let nodes = s.nodes.map((n) => {
        if (n.id !== unionId) return n;
        return { ...n, data: withUnionPartners(data, updatedPartners) };
      });

      if (role) {
        const gender = genderForParentRole(role);
        if (gender) {
          nodes = nodes.map((n) => {
            if (n.id === personId && isPersonData(n.data) && !(n.data as PersonNodeData).gender) {
              return { ...n, data: { ...(n.data as PersonNodeData), gender } };
            }
            return n;
          });
        }
      }

      if (role === "unknown") {
        nodes = applyUnknownRoleNameToPerson(nodes, personId);
      }

      return {
        nodes,
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    });
  },

  updateChildRole: (unionId, personId, role) => {
    set((s) => {
      const edgeIndex = s.edges.findIndex(
        (e) => isChildEdge(e) && e.source === unionId && e.target === personId
      );
      if (edgeIndex === -1) return {};
      return {
        edges: s.edges.map((e, i) => {
          if (i !== edgeIndex) return e;
          const d = { ...(e.data as FamilyTreeEdgeData) };
          if (role) d.childRole = role;
          else delete d.childRole;
          return { ...e, data: d };
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
    const state = get();
    const union = state.nodes.find(
      (n) => n.id === unionId && (n.data as UnionNodeData).kind === "union"
    );
    if (!union) return false;
    const partners = getUnionPartners(union.data as UnionNodeData);
    if (partners.length !== 2) return false;
    return get().moveUnionPartner(unionId, 0, 1);
  },

  moveUnionPartner: (unionId, fromIndex, toIndex) => {
    let didMove = false;
    set((s) => {
      const union = s.nodes.find(
        (n) => n.id === unionId && (n.data as UnionNodeData).kind === "union"
      );
      if (!union) return {};
      const data = union.data as UnionNodeData;
      const partners = getUnionPartners(data);
      if (fromIndex < 0 || fromIndex >= partners.length) return {};
      if (toIndex < 0 || toIndex >= partners.length) return {};
      if (fromIndex === toIndex) return {};

      const reordered = [...partners];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved!);

      const personById = new Map(
        s.nodes
          .filter((n) => (n.data as { kind?: string }).kind === "person")
          .map((n) => [n.id, n as Node<PersonNodeData>])
      );
      const partnerNodes = reordered
        .map((p) => personById.get(p.personId))
        .filter((n): n is Node<PersonNodeData> => n != null);
      if (partnerNodes.length !== reordered.length) return {};

      didMove = true;
      const snap = (x: number, y: number) => snapPosition(x, y, s.snapToGrid);
      const baseY = partnerNodes[0]!.position.y;
      const baseX = Math.min(...partnerNodes.map((n) => n.position.x));

      const newPositions = new Map<string, { x: number; y: number }>();
      reordered.forEach((p, idx) => {
        newPositions.set(p.personId, snap(baseX + idx * PARTNER_DX, baseY));
      });

      let unionPos = union.position;
      if (reordered.length >= 2) {
        const firstPos = newPositions.get(reordered[0]!.personId)!;
        const lastPos = newPositions.get(reordered[reordered.length - 1]!.personId)!;
        const wFirst = s.nodeSizesById[reordered[0]!.personId]?.width ?? DEFAULT_PERSON_W;
        const wLast =
          s.nodeSizesById[reordered[reordered.length - 1]!.personId]?.width ?? DEFAULT_PERSON_W;
        const cFirst = firstPos.x + wFirst / 2;
        const cLast = lastPos.x + wLast / 2;
        const unionCenterX = (cFirst + cLast) / 2;
        const wU = s.nodeSizesById[unionId]?.width ?? DEFAULT_UNION_W;
        unionPos = snap(unionCenterX - wU / 2, baseY + UNION_DY);
      }

      const newData = withUnionPartners(data, reordered);
      const newNodes = s.nodes.map((n) => {
        if (n.id === unionId) {
          return { ...n, position: unionPos, data: newData };
        }
        const newPos = newPositions.get(n.id);
        if (newPos) {
          return { ...n, position: newPos };
        }
        return n;
      });

      return { nodes: newNodes, hasUnsavedChanges: true, lastSaveError: null };
    });
    return didMove;
  },

  setDisplayMode: (mode) => {
    set({ displayMode: mode, placementTargetId: null, hasUnsavedChanges: true, lastSaveError: null });
  },
  setPlacementTargetId: (id) => set({ placementTargetId: id }),
  placeNodeAt: (nodeId, position) => {
    let s = get();
    const snap = (x: number, y: number) => snapPosition(x, y, s.snapToGrid);
    const pos = snap(position.x, position.y);
    const target = s.nodes.find((n) => n.id === nodeId);
    if (!target) return;

    if (target.type === "union" && (target.data as UnionNodeData).kind === "union") {
      const sourceFamily = findFamilyForNode(nodeId, s.families);
      const targetFamilyId = s.activeFamilyTabId;
      if (
        sourceFamily &&
        targetFamilyId &&
        sourceFamily.id !== targetFamilyId &&
        isUnionClusterUnassigned(nodeId, sourceFamily, s.nodes, s.edges)
      ) {
        const clusterUnionIds = getUnassignedClusterUnionIds(
          nodeId,
          sourceFamily,
          s.nodes,
          s.edges
        );
        const { blockedUnionIds, reducedUnionIds } = computeAnchorBlockedUnionIds(
          clusterUnionIds,
          s.nodes,
          s.edges
        );
        if (blockedUnionIds.length > 0) {
          set({
            pendingAnchorTransferWarning: {
              nodeId,
              position: pos,
              sourceFamilyId: sourceFamily.id,
              targetFamilyId,
              reducedUnionIds,
            },
          });
          return;
        }
        get().transferUnionsToFamily(clusterUnionIds, sourceFamily.id, targetFamilyId);
        s = get();
      }

      const data = target.data as UnionNodeData;
      const partners = getUnionPartners(data);
      const partnerIds = partners
        .map((p) => p.personId)
        .filter((pid) => s.nodes.some((n) => n.id === pid));
      const childIds = s.edges
        .filter((e) => e.source === nodeId && isChildEdge(e))
        .map((e) => e.target);
      const updates = new Map<string, { x: number; y: number }>();
      updates.set(nodeId, pos);
      const n = partnerIds.length;
      partnerIds.forEach((pid, i) => {
        updates.set(pid, snap(pos.x + (i - (n - 1) / 2) * PARTNER_DX, pos.y - UNION_DY));
      });
      childIds.forEach((cid, idx) => {
        updates.set(cid, snap(pos.x + idx * DEFAULT_CHILD_ROW_SPACING, pos.y + CHILD_DY));
      });
      set({
        nodes: s.nodes.map((n) => {
          const p = updates.get(n.id);
          if (!p) return n;
          const clearUnset = { ...n.data, positionUnset: false } as FamilyTreeNodeData;
          return { ...n, position: p, data: clearUnset };
        }),
        placementTargetId: null,
        hasUnsavedChanges: true,
        lastSaveError: null,
      });
      return;
    }

    if (target.type === "person") {
      const isLone = !s.edges.some(
        (e) =>
          (isPartnerEdge(e) || isChildEdge(e)) &&
          (e.source === nodeId || e.target === nodeId)
      );
      if (isLone) {
        const sourceFamily = findFamilyForNode(nodeId, s.families);
        const targetFamilyId = s.activeFamilyTabId;
        if (sourceFamily && targetFamilyId && sourceFamily.id !== targetFamilyId) {
          get().moveNodesToFamily([nodeId], targetFamilyId);
          s = get();
        }
      }
    }

    set({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              position: pos,
              data: { ...n.data, positionUnset: false } as FamilyTreeNodeData,
            }
          : n
      ),
      placementTargetId: null,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
  },
  setDirtyDocumentIds: (ids) =>
    set((s) => {
      const prev = s.dirtyDocumentIds;
      if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return s;
      return { dirtyDocumentIds: ids };
    }),
  setLastDocumentForFamily: (familyId, docId) =>
    set((s) => ({
      lastDocumentIdByFamilyId: { ...s.lastDocumentIdByFamilyId, [familyId]: docId },
    })),
  createFamilyDocument: (name, ownerFamilyId) => {
    const s = get();
    const id = generateId();
    const opts = getScriptGenOptions(s);
    let content = "@declarations\n\n@familyTree\n\n";
    const familyId =
      ownerFamilyId ?? s.activeFamilyTabId ?? s.lastActiveFamilyTabId ?? s.families[0]?.id ?? null;
    let docName = (name ?? "").trim();
    let autoNamed = false;
    let nameSuffix: string | undefined;
    if (!docName && familyId) {
      const family = s.families.find((f) => f.id === familyId);
      if (family) {
        const familyDocs = s.documents.filter((d) => d.familyId === familyId);
        nameSuffix = nextDocumentSuffix(
          familyDocs.map((d) => d.name),
          family.name
        );
        docName = formatMainDocumentName(family.name, nameSuffix);
        autoNamed = true;
      }
    }
    if (!docName) docName = "Untitled";
    if (familyId) {
      const family = s.families.find((f) => f.id === familyId);
      if (family) {
        const scopeIds = getScopeIdsForFamily(family, s.nodes, s.edges);
        if (scopeIds.size > 0) {
          content = generateFamilyTreeScript(s.nodes, s.edges, { ...opts, scopeNodeIds: scopeIds });
        }
      }
    }
    const doc: FamilyTreeDocumentRecord = {
      id,
      name: docName,
      content,
      familyId,
      role: "main",
      updatedAt: Date.now(),
      ...(autoNamed ? { autoNamed: true, nameSuffix } : {}),
    };
    set({
      documents: [...s.documents, doc],
      lastDocumentIdByFamilyId: familyId
        ? { ...s.lastDocumentIdByFamilyId, [familyId]: id }
        : s.lastDocumentIdByFamilyId,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    return id;
  },
  renameFamilyDocument: (docId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({
      documents: s.documents.map((d) => {
        if (d.id !== docId) return d;
        const { autoNamed: _a, nameSuffix: _s, ...rest } = d;
        return { ...rest, name: trimmed, updatedAt: Date.now() };
      }),
      hasUnsavedChanges: true,
      lastSaveError: null,
    }));
  },
  deleteFamilyDocumentCascade: (docId, content) => {
    const s = get();
    const counts = previewFamilyDocumentDeleteCounts(content);
    const { personIds, unionIds } = scanDocumentDeclaredIds(content);
    const declaredIds = [...personIds, ...unionIds];
    const idToDocs = new Map<string, Set<string>>();
    for (const doc of s.documents) {
      const scanned = scanDocumentDeclaredIds(doc.id === docId ? content : doc.content);
      for (const pid of scanned.personIds) {
        if (!idToDocs.has(pid)) idToDocs.set(pid, new Set());
        idToDocs.get(pid)!.add(doc.id);
      }
      for (const uid of scanned.unionIds) {
        if (!idToDocs.has(uid)) idToDocs.set(uid, new Set());
        idToDocs.get(uid)!.add(doc.id);
      }
    }
    const uniqueIds = declaredIds.filter((nodeId) => {
      const docs = idToDocs.get(nodeId);
      return docs?.size === 1 && docs.has(docId);
    });
    const removeSet = new Set(uniqueIds);
    set((state) => {
      const newNodes = state.nodes.filter((n) => !removeSet.has(n.id));
      const newEdges = state.edges.filter(
        (e) => !removeSet.has(e.source) && !removeSet.has(e.target)
      );
      const newSelectedIds = state.selectedNodeIds.filter((id) => !removeSet.has(id));
      return {
        nodes: newNodes,
        edges: newEdges,
        documents: state.documents.filter((d) => d.id !== docId),
        dirtyDocumentIds: state.dirtyDocumentIds.filter((id) => id !== docId),
        selectedNodeIds: newSelectedIds,
        primarySelectedNodeId: newSelectedIds[0] ?? null,
        hasUnsavedChanges: true,
        lastSaveError: null,
      };
    });
    get().runNameRoleAnalysis();
    get().recomputeFamilies();
    return counts;
  },
  applyFamilyDocumentEdits: (edits) => {
    const s = get();
    const editMap = new Map(edits.map((e) => [e.docId, e.content]));
    const combined = combineFamilyDocumentContents(s.documents, editMap);
    const parsed = parseFamilyTreeScript(
      combined,
      s.nodes,
      s.edges,
      s.connectionStyles,
      s.generationAnchors,
      s.branches
    );
    if (parsed.errors.length > 0) {
      return { ok: false, errors: parsed.errors };
    }
    const now = Date.now();
    const updatedDocs = s.documents.map((doc) => {
      const newContent = editMap.get(doc.id);
      if (newContent !== undefined) {
        return { ...doc, content: newContent, updatedAt: now };
      }
      return doc;
    });
    const editDocIds = [...editMap.keys()];
    const nodeIds = new Set(parsed.nodes.map((n) => n.id));
    const prunedSelection = s.selectedNodeIds.filter((id) => nodeIds.has(id));
    set({
      nodes: parsed.nodes,
      edges: parsed.edges,
      connectionStyles: parsed.connectionStyles,
      branches: parsed.branches,
      documents: updatedDocs,
      dirtyDocumentIds: s.dirtyDocumentIds.filter((id) => !editDocIds.includes(id)),
      selectedNodeIds: prunedSelection,
      primarySelectedNodeId: prunedSelection[0] ?? null,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    get().runNameRoleAnalysis();
    get().recomputeFamilies();
    return { ok: true, errors: [] };
  },
  ensureDefaultDocuments: () => ensureDefaultDocumentsImpl(get, set),
  getDocumentDisplayContent: (docId) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === docId);
    if (!doc) return "";
    return generateDocumentDisplayContent(
      doc,
      s.documents,
      s.nodes,
      s.edges,
      getScriptGenOptions(s)
    );
  },

  loadTree: async (projectId) => {
    const driver = getStorageDriver();
    const raw = await driver.loadProjectData(projectId);
    const payload = raw?.moduleType === "familyTree" ? raw : null;
    const rawNodes = (payload?.nodes ?? []) as Node<FamilyTreeNodeData>[];
    const nodes = normalizeUnknownNames(rawNodes);
    const edges = (payload?.edges ?? []) as Edge[];
    const hadData = payload != null;
    const savedAlignment = payload?.ui?.singleChildAlignment;

    let initialFamilies: FamilyGroup[] = [];
    if (payload?.families && payload.families.length > 0) {
      initialFamilies = payload.families.map((r) => toFamilyGroup(r, nodes, edges));
    } else if (hadData) {
      const legacyNames =
        (payload as { customFamilyNames?: CustomFamilyNameRecord[] })?.customFamilyNames ?? [];
      const migrated = migrateLegacyFamilies(nodes, edges, legacyNames);
      initialFamilies = migrated.map((r) => toFamilyGroup(r, nodes, edges));
    }

    const savedFullUnion = (payload?.ui?.fullUnionSettings ?? {}) as Partial<FullUnionSettings>;

    set({
      activeProjectId: projectId,
      nodes,
      edges,
      generationAnchors: (payload as { generationAnchors?: GenerationAnchor[] })?.generationAnchors ?? [],
      connectionStyles: payload?.connectionStyles ?? [],
      customParentRoles: Array.isArray(payload?.customParentRoles)
        ? payload!.customParentRoles.filter((r): r is string => typeof r === "string")
        : [],
      customGenders: Array.isArray(payload?.customGenders)
        ? payload!.customGenders.filter((g): g is string => typeof g === "string")
        : [],
      customChildRoles: Array.isArray(payload?.customChildRoles)
        ? payload!.customChildRoles.filter((r): r is string => typeof r === "string")
        : [],
      families: initialFamilies,
      branches: (payload?.branches ?? []) as BranchRecord[],
      documents: (payload?.documents ?? []) as FamilyTreeDocumentRecord[],
      displayMode:
        payload?.displayMode === "text" ? "text" : "nodes",
      dirtyDocumentIds: [],
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
      showGenerationAnchors: payload?.ui?.showGenerationAnchors ?? true,
      showGenInheritIndicator: payload?.ui?.showGenInheritIndicator ?? true,
      genAnchorBandOpacity: payload?.ui?.genAnchorBandOpacity ?? 6,
      genAnchorLineOpacity: payload?.ui?.genAnchorLineOpacity ?? 35,
      defaultUnionType:
        payload?.ui?.defaultUnionType === "forward" ||
        payload?.ui?.defaultUnionType === "backward" ||
        payload?.ui?.defaultUnionType === "full"
          ? payload.ui.defaultUnionType
          : "forward",
      fullUnionSettings: {
        ...DEFAULT_FULL_UNION_SETTINGS,
        includeFather:
          savedFullUnion.includeFather ??
          DEFAULT_FULL_UNION_SETTINGS.includeFather,
        includeMother:
          savedFullUnion.includeMother ??
          DEFAULT_FULL_UNION_SETTINGS.includeMother,
        includeChildren:
          savedFullUnion.includeChildren ??
          DEFAULT_FULL_UNION_SETTINGS.includeChildren,
        childCount: Math.min(
          12,
          Math.max(
            0,
            Math.round(
              savedFullUnion.childCount ??
                DEFAULT_FULL_UNION_SETTINGS.childCount
            )
          )
        ),
        advancedEnabled:
          savedFullUnion.advancedEnabled ??
          DEFAULT_FULL_UNION_SETTINGS.advancedEnabled,
        parents: (savedFullUnion.parents ?? DEFAULT_FULL_UNION_SETTINGS.parents).slice(
          0,
          12
        ),
        children: (savedFullUnion.children ?? DEFAULT_FULL_UNION_SETTINGS.children).slice(
          0,
          12
        ),
        autoAssignMissingPartner:
          savedFullUnion.autoAssignMissingPartner ??
          DEFAULT_FULL_UNION_SETTINGS.autoAssignMissingPartner,
      },
      selectedNodeIds: [],
      primarySelectedNodeId: null,
      primarySelectionPinnedId: null,
      nodeSizesById: {},
      viewportBounds: null,
      hasUnsavedChanges: false,
      lastSaveError: null,
      genInheritFlashByNodeId: {},
      pendingGenChangePrompt: null,
      reviewNodesModalOpen: false,
      hoveredConnectionInfo: null,
      editingAnchorIds: [],
      activeFamilyTabId: null,
      isolationModeActive: false,
      pendingFocusFamilyId: null,
      pendingBloodlineWarning: null,
      pendingDeleteConfirm: null,
      pendingClearFamilyConfirm: null,
      pendingAnchorTransferWarning: null,
      familyConnectionNotice: null,
      inspectorFamilyId: null,
      activeBranchTabId: null,
      inspectorBranchId: null,
      branchToolActive: false,
      pendingFocusBranchId: null,
      placementTargetId: null,
      legendMode:
        (payload?.ui as { legendMode?: string })?.legendMode === "tooltipsAndIcons"
          ? "tooltipsAndIcons"
          : "tooltips",
      subEntitySelectionMode:
        (payload?.ui as { subEntitySelectionMode?: string })?.subEntitySelectionMode === "union"
          ? "union"
          : "node",
      lastDocumentIdByFamilyId:
        ((payload?.ui as { lastDocumentIdByFamilyId?: Record<string, string> })
          ?.lastDocumentIdByFamilyId ?? {}) as Record<string, string>,
    });
    const afterLoad = get();
    const scriptOpts = getScriptGenOptions(afterLoad);
    let docsMigrated = false;
    const migratedDocuments = afterLoad.documents.map((doc) => {
      const next = migrateLegacyDocumentContent(
        doc,
        afterLoad.documents,
        afterLoad.nodes,
        afterLoad.edges,
        scriptOpts
      );
      if (next.content !== doc.content) docsMigrated = true;
      return next;
    });
    if (docsMigrated) {
      set({ documents: migratedDocuments, hasUnsavedChanges: true });
    }
    get().runNameRoleAnalysis();
    get().recomputeFamilies();
    const afterReconcile = get();
    const ownedDocs = migrateDocumentOwnership(
      afterReconcile.documents,
      afterReconcile.families,
      afterReconcile.nodes,
      afterReconcile.edges
    );
    if (ownedDocs.some((d, i) => d.familyId !== afterReconcile.documents[i]?.familyId)) {
      set({ documents: ownedDocs, hasUnsavedChanges: true });
    }
    get().ensureDefaultDocuments();
    return { hadData };
  },

  applyFamilyTreeScriptEdits: (content) => {
    const s = get();
    const parsed = parseFamilyTreeScript(
      content,
      s.nodes,
      s.edges,
      s.connectionStyles,
      s.generationAnchors,
      s.branches
    );
    if (parsed.errors.length > 0) {
      return { ok: false, errors: parsed.errors };
    }

    const nodeIds = new Set(parsed.nodes.map((n) => n.id));
    const prunedSelection = s.selectedNodeIds.filter((id) => nodeIds.has(id));

    set({
      nodes: parsed.nodes,
      edges: parsed.edges,
      connectionStyles: parsed.connectionStyles,
      branches: parsed.branches,
      selectedNodeIds: prunedSelection,
      primarySelectedNodeId: prunedSelection[0] ?? null,
      hasUnsavedChanges: true,
      lastSaveError: null,
    });
    get().runNameRoleAnalysis();
    get().recomputeFamilies();
    return { ok: true, errors: [] };
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
        displayMode: s.displayMode,
        nodes: s.nodes,
        edges: s.edges,
        anchorNodeId: null,
        generationAnchors: s.generationAnchors,
        connectionStyles: s.connectionStyles,
        customParentRoles: s.customParentRoles,
        customGenders: s.customGenders,
        customChildRoles: s.customChildRoles,
        families: familiesToPersisted(s.families),
        branches: branchesToPersisted(s.branches),
        documents: s.documents.map((d) => ({ ...d })),
        ui: {
          genLabelMode: s.genLabelMode,
          showGenerationAnchors: s.showGenerationAnchors,
          showGenInheritIndicator: s.showGenInheritIndicator,
          genAnchorBandOpacity: s.genAnchorBandOpacity,
          genAnchorLineOpacity: s.genAnchorLineOpacity,
          snapToGrid: s.snapToGrid,
          showNodeInfoEnabled: s.showNodeInfoEnabled,
          nodeInfoTopLeft: s.nodeInfoTopLeft,
          nodeInfoCenter: s.nodeInfoCenter,
          nodeInfoSize: s.nodeInfoSize,
          nodeInfoSpacing: s.nodeInfoSpacing,
          singleChildAlignment: s.singleChildAlignment,
          childrenRowAlignment3Plus: s.childrenRowAlignment3Plus,
          persistUnionSelectionOnChildCreate: s.persistUnionSelectionOnChildCreate,
          defaultUnionType: s.defaultUnionType,
          fullUnionSettings: s.fullUnionSettings,
          legendMode: s.legendMode,
          subEntitySelectionMode: s.subEntitySelectionMode,
          lastDocumentIdByFamilyId: s.lastDocumentIdByFamilyId,
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
      const newPendingGen =
        s.pendingGenChangePrompt && ids.has(s.pendingGenChangePrompt.nodeId) ? null : s.pendingGenChangePrompt;
      const newNodeSizesById = { ...s.nodeSizesById };
      for (const id of ids) delete newNodeSizesById[id];
      const newGenInheritFlash = { ...s.genInheritFlashByNodeId };
      for (const id of ids) delete newGenInheritFlash[id];
      const prunedBranches = s.branches.filter((b) => !ids.has(b.rootPersonId));
      const removedBranchIds = new Set(
        s.branches.filter((b) => ids.has(b.rootPersonId)).map((b) => b.id)
      );
      return {
        nodes: newNodes,
        edges: newEdges,
        selectedNodeIds: newSelectedIds,
        primarySelectedNodeId: newPrimary,
        nodeSizesById: newNodeSizesById,
        genInheritFlashByNodeId: newGenInheritFlash,
        pendingGenChangePrompt: newPendingGen,
        branches: prunedBranches,
        activeBranchTabId:
          s.activeBranchTabId && removedBranchIds.has(s.activeBranchTabId) ? null : s.activeBranchTabId,
        inspectorBranchId:
          s.inspectorBranchId && removedBranchIds.has(s.inspectorBranchId) ? null : s.inspectorBranchId,
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
      customParentRoles: [],
      customGenders: [],
      customChildRoles: [],
      families: [],
      branches: [],
      editingAnchorIds: [],
      selectedNodeIds: [],
      primarySelectedNodeId: null,
      primarySelectionPinnedId: null,
      nodeSizesById: {},
      viewportBounds: null,
      genInheritFlashByNodeId: {},
      pendingGenChangePrompt: null,
      nameRoleSuggestions: [],
      reviewNodesModalOpen: false,
      hoveredConnectionInfo: null,
      activeFamilyTabId: null,
      isolationModeActive: false,
      pendingFocusFamilyId: null,
      pendingBloodlineWarning: null,
      pendingDeleteConfirm: null,
      pendingClearFamilyConfirm: null,
      pendingAnchorTransferWarning: null,
      familyConnectionNotice: null,
      inspectorFamilyId: null,
      activeBranchTabId: null,
      inspectorBranchId: null,
      branchToolActive: false,
      pendingFocusBranchId: null,
      placementTargetId: null,
      displayMode: "nodes",
      documents: [],
      dirtyDocumentIds: [],
    });
    if (pid) {
      const driver = getStorageDriver();
      driver.saveProjectData(pid, {
        version: 1,
        moduleType: "familyTree",
        displayMode: "nodes",
        nodes: [],
        edges: [],
        anchorNodeId: null,
        generationAnchors: [],
        connectionStyles: [],
        families: [],
        branches: [],
        documents: [],
        ui: {
          genLabelMode: "letters",
          showGenerationAnchors: true,
          showGenInheritIndicator: true,
          genAnchorBandOpacity: 6,
          genAnchorLineOpacity: 35,
          snapToGrid: true,
          showNodeInfoEnabled: false,
          nodeInfoTopLeft: true,
          nodeInfoCenter: false,
          nodeInfoSize: false,
          nodeInfoSpacing: false,
          singleChildAlignment: "left",
          childrenRowAlignment3Plus: "center",
          persistUnionSelectionOnChildCreate: true,
        },
      });
      driver.updateProjectMeta(pid, { updatedAt: Date.now() });
    }
  },
}));

useFamilyTreeStore.subscribe((state) => {
  const nodesOrEdgesChanged =
    state.nodes !== prevNodes || state.edges !== prevEdges;
  if (nodesOrEdgesChanged && state.documents.length > 0) {
    syncFamilyDocumentsFromModel(
      () => useFamilyTreeStore.getState(),
      (partial) => useFamilyTreeStore.setState(partial)
    );
  }
  const generationAnchorsJson = JSON.stringify(state.generationAnchors);
  const connectionStylesJson = JSON.stringify(state.connectionStyles);
  const familiesJson = JSON.stringify(familiesToPersisted(state.families));
  const branchesJson = JSON.stringify(branchesToPersisted(state.branches));
  const documentsUpdatedAtSum = state.documents.reduce((sum, d) => sum + d.updatedAt, 0);
  const documentsChanged =
    state.documents !== prevDocumentsRef || documentsUpdatedAtSum !== prevDocumentsUpdatedAtSum;

  const lastDocumentIdJson = JSON.stringify(state.lastDocumentIdByFamilyId);
  const fullUnionSettingsJson = JSON.stringify(state.fullUnionSettings);

  const uiPrefsChanged =
    state.showNodeInfoEnabled !== prevShowNodeInfoEnabled ||
    state.nodeInfoTopLeft !== prevNodeInfoTopLeft ||
    state.nodeInfoCenter !== prevNodeInfoCenter ||
    state.nodeInfoSize !== prevNodeInfoSize ||
    state.nodeInfoSpacing !== prevNodeInfoSpacing ||
    state.singleChildAlignment !== prevSingleChildAlignment ||
    state.childrenRowAlignment3Plus !== prevChildrenRowAlignment3Plus ||
    state.persistUnionSelectionOnChildCreate !== prevPersistUnionSelectionOnChildCreate ||
    state.showGenerationAnchors !== prevShowGenerationAnchors ||
    state.showGenInheritIndicator !== prevShowGenInheritIndicator ||
    state.genAnchorBandOpacity !== prevGenAnchorBandOpacity ||
    state.genAnchorLineOpacity !== prevGenAnchorLineOpacity ||
    state.genLabelMode !== prevGenLabelMode ||
    generationAnchorsJson !== prevGenerationAnchorsJson ||
    connectionStylesJson !== prevConnectionStylesJson ||
    familiesJson !== prevFamiliesJson ||
    branchesJson !== prevBranchesJson ||
    documentsChanged ||
    state.displayMode !== prevDisplayMode ||
    state.legendMode !== prevLegendMode ||
    state.subEntitySelectionMode !== prevSubEntitySelectionMode ||
    lastDocumentIdJson !== prevLastDocumentIdJson ||
    fullUnionSettingsJson !== prevFullUnionSettingsJson ||
    state.defaultUnionType !== prevDefaultUnionType;
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
  prevShowGenerationAnchors = state.showGenerationAnchors;
  prevShowGenInheritIndicator = state.showGenInheritIndicator;
  prevGenAnchorBandOpacity = state.genAnchorBandOpacity;
  prevGenAnchorLineOpacity = state.genAnchorLineOpacity;
  prevGenLabelMode = state.genLabelMode;
  prevGenerationAnchorsJson = generationAnchorsJson;
  prevConnectionStylesJson = connectionStylesJson;
  prevFamiliesJson = familiesJson;
  prevBranchesJson = branchesJson;
  prevDocumentsRef = state.documents;
  prevDocumentsUpdatedAtSum = documentsUpdatedAtSum;
  prevDisplayMode = state.displayMode;
  prevLegendMode = state.legendMode;
  prevSubEntitySelectionMode = state.subEntitySelectionMode;
  prevLastDocumentIdJson = lastDocumentIdJson;
  prevFullUnionSettingsJson = fullUnionSettingsJson;
  prevDefaultUnionType = state.defaultUnionType;
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
