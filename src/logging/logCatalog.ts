import type { LogCategory, LogTier } from "./actionLog";

export type SummarizeResult = {
  detail?: string;
  payload?: unknown;
  tier?: LogTier;
  category?: LogCategory;
};

export type SummarizeFn = (args: unknown[], getState?: () => unknown) => SummarizeResult | undefined;

export interface CatalogEntry {
  category: LogCategory;
  tier: LogTier;
  summarize?: SummarizeFn;
}

const THROTTLE_MS = 250;
const throttleLastAt = new Map<string, number>();
const throttleRepeat = new Map<string, number>();

/** High-frequency setters: verbose tier, coalesced per 250ms window. */
export const THROTTLED_ACTIONS = new Set([
  "setNodes",
  "setEdges",
  "setViewportBounds",
  "setNodeSizesById",
]);

function personLabel(id: string, getState?: () => unknown): string {
  if (!getState) return id;
  try {
    const state = getState() as {
      nodes?: { id: string; data?: { kind?: string; firstName?: string; name?: string } }[];
    };
    const node = state.nodes?.find((n) => n.id === id);
    if (!node?.data || node.data.kind !== "person") return id;
    const name = node.data.firstName || node.data.name || id;
    return `${name} (${id})`;
  } catch {
    return id;
  }
}

function summarizePersonGender(args: unknown[], getState?: () => unknown): SummarizeResult {
  const [personId, gender] = args as [string, string | null];
  return {
    detail: `${personLabel(personId, getState)}: ${gender ?? "unset"}`,
    payload: { personId, gender },
  };
}

function summarizeNameParts(args: unknown[], getState?: () => unknown): SummarizeResult {
  const [nodeId, parts] = args as [
    string,
    { firstName: string; middleName: string; lastName: string },
  ];
  const p = parts ?? { firstName: "", middleName: "", lastName: "" };
  return {
    detail: `${personLabel(nodeId, getState)}: "${p.firstName}" "${p.middleName}" "${p.lastName}"`,
    payload: { nodeId, ...p },
  };
}

function summarizeRoleAt(args: unknown[]): SummarizeResult {
  const [unionId, partnerIndex, role] = args as [string, number, string | null];
  return {
    detail: `union ${unionId} slot ${partnerIndex}: ${role ?? "unset"}`,
    payload: { unionId, partnerIndex, role },
  };
}

function summarizeChildRole(args: unknown[]): SummarizeResult {
  const [unionId, personId, role] = args as [string, string, string | null];
  return {
    detail: `union ${unionId} child ${personId}: ${role ?? "unset"}`,
    payload: { unionId, personId, role },
  };
}

function summarizeIds(args: unknown[], label: string): SummarizeResult {
  return {
    detail: `${label}: ${JSON.stringify(args.map((a) => sanitizeArg(a)))}`,
    payload: args,
  };
}

function sanitizeArg(a: unknown): unknown {
  if (Array.isArray(a)) return `[${a.length} items]`;
  return a;
}

function summarizeSelection(args: unknown[]): SummarizeResult {
  const ids = args[0] as string[] | undefined;
  const count = ids?.length ?? 0;
  return {
    detail: count === 0 ? "cleared" : `${count} node(s)`,
    payload: { ids: ids?.slice(0, 10), count },
  };
}

function summarizeDisplayMode(args: unknown[]): SummarizeResult {
  const [mode] = args as [string];
  return { detail: String(mode), payload: { mode } };
}

function summarizeMoveNodes(args: unknown[]): SummarizeResult {
  const [nodeIds, familyId] = args as [string[], string];
  return {
    detail: `${nodeIds.length} node(s) -> family ${familyId}`,
    payload: { nodeIds: nodeIds.slice(0, 10), count: nodeIds.length, familyId },
  };
}

const CATALOG: Record<string, CatalogEntry> = {
  setPersonGender: { category: "person", tier: "action", summarize: summarizePersonGender },
  updatePersonNameParts: { category: "person", tier: "action", summarize: summarizeNameParts },
  updateNodeName: { category: "person", tier: "action", summarize: (args, get) => {
    const [nodeId, name] = args as [string, string];
    return { detail: `${personLabel(nodeId, get)} -> "${name}"`, payload: { nodeId, name } };
  }},
  updatePersonNicknames: { category: "person", tier: "action" },
  updateUnionPartnerRole: { category: "union", tier: "action" },
  updateUnionPartnerRoleAt: { category: "union", tier: "action", summarize: summarizeRoleAt },
  updateChildRole: { category: "union", tier: "action", summarize: summarizeChildRole },
  setRoleStyleLink: { category: "union", tier: "action" },
  setRoleStyleOverride: { category: "union", tier: "action" },
  resetRoleStyle: { category: "union", tier: "action" },
  resetAllBuiltInRoleStyles: { category: "union", tier: "action" },
  setUnionUseRoleStyles: { category: "union", tier: "action" },
  createUnion: { category: "union", tier: "action" },
  createBackwardUnion: { category: "union", tier: "action" },
  createFullUnion: { category: "union", tier: "action" },
  addChild: { category: "union", tier: "action" },
  addParent: { category: "union", tier: "action" },
  linkPersonToUnion: { category: "union", tier: "action" },
  removePartnerFromUnion: { category: "union", tier: "action" },
  moveUnionPartner: { category: "union", tier: "action" },
  swapUnionPartners: { category: "union", tier: "action" },
  removeChildFromUnion: { category: "union", tier: "action" },
  moveChildToUnion: { category: "union", tier: "action" },
  addPerson: { category: "node", tier: "action" },
  removeNodes: { category: "node", tier: "action", summarize: (args) => summarizeIds(args, "remove") },
  performDeleteNodes: { category: "node", tier: "action" },
  placeNodeAt: { category: "layout", tier: "action" },
  runLayout: { category: "layout", tier: "action" },
  sortUnion: { category: "layout", tier: "action" },
  setSelectedNodeIds: { category: "selection", tier: "action", summarize: summarizeSelection },
  setSelectionWithPrimary: { category: "selection", tier: "action", summarize: summarizeSelection },
  setDisplayMode: { category: "ui", tier: "action", summarize: summarizeDisplayMode },
  loadTree: { category: "persistence", tier: "action" },
  saveTree: { category: "persistence", tier: "action" },
  clearTree: { category: "persistence", tier: "action" },
  loadTimeline: { category: "persistence", tier: "action" },
  saveTimeline: { category: "persistence", tier: "action" },
  loadProject: { category: "persistence", tier: "action" },
  saveProject: { category: "persistence", tier: "action" },
  setActiveProject: { category: "persistence", tier: "action" },
  createFamily: { category: "family", tier: "action" },
  deleteFamily: { category: "family", tier: "action" },
  moveNodesToFamily: { category: "family", tier: "action", summarize: summarizeMoveNodes },
  setActiveFamilyTabId: { category: "family", tier: "action" },
  applyFamilyDocumentEdits: { category: "document", tier: "action" },
  applyFamilyTreeScriptEdits: { category: "document", tier: "action" },
  applyDocumentEdits: { category: "document", tier: "action" },
  addLane: { category: "node", tier: "action" },
  addBeat: { category: "node", tier: "action" },
  moveBeat: { category: "layout", tier: "action" },
  moveBeatsGroup: { category: "layout", tier: "action" },
  addCharacter: { category: "node", tier: "action" },
  updateCharacterName: { category: "person", tier: "action" },
  setNodes: { category: "node", tier: "verbose" },
  setEdges: { category: "node", tier: "verbose" },
  setViewportBounds: { category: "ui", tier: "verbose" },
  setNodeSizesById: { category: "layout", tier: "verbose" },
};

function heuristicCategory(actionName: string): LogCategory {
  const n = actionName.toLowerCase();
  if (n.includes("union") || n.includes("partner") || n.includes("child")) return "union";
  if (n.includes("person") || n.includes("gender") || n.includes("name")) return "person";
  if (n.includes("select")) return "selection";
  if (n.includes("document") || n.includes("script")) return "document";
  if (n.includes("family") || n.includes("branch")) return "family";
  if (n.includes("layout") || n.includes("sort") || n.includes("anchor")) return "layout";
  if (n.includes("save") || n.includes("load") || n.includes("persist")) return "persistence";
  if (n.includes("node") || n.includes("edge") || n.includes("beat") || n.includes("lane")) return "node";
  return "ui";
}

export function resolveCatalogEntry(actionName: string): CatalogEntry {
  return (
    CATALOG[actionName] ?? {
      category: heuristicCategory(actionName),
      tier: "verbose" as LogTier,
    }
  );
}

export function shouldThrottleAction(actionName: string): boolean {
  return THROTTLED_ACTIONS.has(actionName);
}

/** Returns true if event should be emitted; manages repeat coalescing for throttled actions. */
export function consumeThrottleSlot(
  moduleId: string,
  actionName: string,
  now: number
): { emit: boolean; repeat?: number } {
  const key = `${moduleId}:${actionName}`;
  const last = throttleLastAt.get(key) ?? 0;
  if (now - last < THROTTLE_MS) {
    throttleRepeat.set(key, (throttleRepeat.get(key) ?? 0) + 1);
    return { emit: false };
  }
  const repeat = (throttleRepeat.get(key) ?? 0) + 1;
  throttleLastAt.set(key, now);
  throttleRepeat.set(key, 0);
  return { emit: true, repeat: repeat > 1 ? repeat : undefined };
}

export function summarizeAction(
  actionName: string,
  args: unknown[],
  getState?: () => unknown
): SummarizeResult {
  const entry = CATALOG[actionName];
  if (entry?.summarize) {
    return entry.summarize(args, getState) ?? {};
  }
  if (args.length === 0) return {};
  return {
    payload: args.length <= 3 ? args : { arg0: args[0], count: args.length },
  };
}

/** Reserved for future custom event metadata helpers. */
export function customEventMeta(
  _label: string,
  category: LogCategory,
  tier: LogTier = "action"
): CatalogEntry {
  return { category, tier };
}
