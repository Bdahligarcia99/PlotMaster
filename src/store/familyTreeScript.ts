import type { Node, Edge } from "reactflow";
import {
  type BranchRecord,
  type ConnectionStyleDef,
  type FamilyTreeNodeData,
  type GenerationAnchor,
  type ParentRole,
  type PersonNodeData,
  type UnionArrangeSpacing,
  type UnionNodeData,
  CHILD_DY,
  DEFAULT_UNION_W,
  UNION_DY,
  isChildEdge,
  isPartnerEdge,
  withUnionPartners,
} from "./familyTreeStore";

export interface ParsedFamilyTreeScript {
  nodes: Node<FamilyTreeNodeData>[];
  edges: Edge[];
  connectionStyles: ConnectionStyleDef[];
  branches: BranchRecord[];
  errors: string[];
}


export function escapeScriptQuoted(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseConnectionStyleLine(line: string): ConnectionStyleDef | null {
  const match = line.match(
    /^@(\S+)\s+"([^"]*)"\s*\{\s*stroke:\s*([^,]+),\s*width:\s*([\d.]+),\s*dash:\s*\[([^\]]*)\](?:,\s*description:\s*"((?:[^"\\]|\\.)*)")?\s*\}\s*$/
  );
  if (!match) return null;
  const [, id, name, stroke, widthStr, dashInner, description] = match;
  const dashPattern = dashInner!
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseFloat(s))
    .filter((n) => !Number.isNaN(n));
  return {
    id: id!,
    name: name!,
    stroke: stroke!.trim(),
    strokeWidth: parseFloat(widthStr!),
    dashPattern,
    description: description?.replace(/\\"/g, '"'),
  };
}

function parseQuotedValue(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return trimmed;
}

function parseFieldValue(line: string, key: string): string | null {
  const re = new RegExp(`\\b${key}:\\s*(.+)$`);
  const m = re.exec(line.trim());
  if (!m) return null;
  return m[1]!.trim();
}

function parseCoordValue(raw: string | null): number | "unset" | undefined {
  if (raw == null) return undefined;
  const t = raw.trim();
  if (t === "?") return "unset";
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function parseArrangeTag(tag: string): UnionArrangeSpacing {
  const spacing: UnionArrangeSpacing = {};
  for (const part of tag.split(",")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key === "parents") spacing.parentSpacing = parseFloat(val);
    else if (key === "children") spacing.childSpacing = parseFloat(val);
    else if (key === "vertical") spacing.verticalSpacing = parseFloat(val);
    else if (key === "align" && (val === "left" || val === "center" || val === "right")) {
      spacing.parentAlignment = val;
    }
  }
  return spacing;
}

interface ParsedPersonDeclaration {
  id: string;
  data: PersonNodeData;
  position?: { x: number; y: number };
  positionUnset?: boolean;
}

interface ParsedUnionMember {
  personId: string;
  type: string;
  role?: string;
  dx?: number;
  dy?: number;
  rx?: number;
  ry?: number;
}

interface ParsedUnionBlock {
  unionId: string;
  name?: string;
  position?: { x: number; y: number };
  positionUnset?: boolean;
  styleName?: string;
  mainGraph?: boolean;
  arrange?: UnionArrangeSpacing;
  notes: string;
  members: ParsedUnionMember[];
}

interface ParsedBranchBlock {
  id: string;
  name: string;
  rootPersonId: string;
  mode: "hidden" | "tab";
  description: string;
  unionIds: string[];
}

function personDataFromFields(
  fields: Record<string, string>,
  genAnchorId?: string
): PersonNodeData {
  const first = parseQuotedValue(fields.first ?? "");
  const middle = parseQuotedValue(fields.middle ?? "");
  const last = parseQuotedValue(fields.last ?? "");
  const name = [first, middle, last].filter(Boolean).join(" ") || "Person";
  const nickRaw = fields.nicknames ?? "";
  const nicknames = nickRaw
    ? nickRaw.split(",").map((n) => parseQuotedValue(n.trim())).filter(Boolean)
    : [];
  const anchored = fields.anchored === "true";
  const gender = fields.gender ? parseQuotedValue(fields.gender) : undefined;
  const genAnchorLocked = fields.genLock === "true";
  return {
    kind: "person",
    name,
    firstName: first,
    middleName: middle,
    lastName: last,
    notes: parseQuotedValue(fields.notes ?? ""),
    nicknames,
    genAnchorId: genAnchorId ?? null,
    isGenArmed: false,
    ...(anchored ? { anchored: true } : {}),
    ...(gender ? { gender } : {}),
    ...(genAnchorLocked ? { genAnchorLocked: true } : {}),
  };
}

function defaultPersonPosition(existingNodes: Node<FamilyTreeNodeData>[], index: number) {
  let maxY = 0;
  for (const n of existingNodes) {
    maxY = Math.max(maxY, n.position.y);
  }
  return {
    x: 100 + (index % 4) * 224,
    y: maxY + CHILD_DY + Math.floor(index / 4) * 80,
  };
}

function unionPositionBetween(
  positions: { x: number; y: number }[] | { x: number; y: number },
  rightPos?: { x: number; y: number }
) {
  const posList =
    rightPos != null && !Array.isArray(positions)
      ? [positions, rightPos]
      : Array.isArray(positions)
        ? positions
        : [positions];
  if (posList.length === 0) return { x: 100, y: 100 };
  const midX = posList.reduce((sum, p) => sum + p.x, 0) / posList.length;
  const unionY = Math.min(...posList.map((p) => p.y)) - UNION_DY;
  return { x: midX - DEFAULT_UNION_W / 2, y: unionY };
}

function parsePersonBlockFields(bodyLines: string[]): {
  fields: Record<string, string>;
  position?: { x: number; y: number };
  positionUnset?: boolean;
  genIndex?: number;
} {
  const fields: Record<string, string> = {};
  let position: { x: number; y: number } | undefined;
  let positionUnset = false;
  let genIndex: number | undefined;

  for (const raw of bodyLines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();

    if (key === "x") {
      const cv = parseCoordValue(val);
      if (cv === "unset") positionUnset = true;
      else if (typeof cv === "number") position = { ...(position ?? { x: 0, y: 0 }), x: cv };
    } else if (key === "y") {
      const cv = parseCoordValue(val);
      if (cv === "unset") positionUnset = true;
      else if (typeof cv === "number") position = { ...(position ?? { x: 0, y: 0 }), y: cv };
    } else if (key === "gen") {
      const idx = parseInt(val, 10);
      if (!Number.isNaN(idx)) genIndex = idx;
    } else {
      fields[key] = val;
    }
  }

  return { fields, position, positionUnset, genIndex };
}

function parsePersonMemberLine(line: string): ParsedUnionMember | null {
  const trimmed = line.trim();
  const headerMatch = /^Person\s+(\S+)\s+type:\s*(.+?)(?:\s*\{|\s*$)/i.exec(trimmed);
  if (!headerMatch) return null;
  const personId = headerMatch[1]!;
  if (personId === "?") return null;
  let typeToken = headerMatch[2]!.trim();
  if (typeToken.startsWith('"')) {
    typeToken = parseQuotedValue(typeToken);
  } else {
    typeToken = typeToken.split(/\s/)[0]!;
  }
  const type = typeToken.toLowerCase() === "child" ? "child" : typeToken;

  let dx: number | undefined;
  let dy: number | undefined;
  let role: string | undefined;
  const braceIdx = trimmed.indexOf("{");
  if (braceIdx >= 0) {
    const inner = trimmed.slice(braceIdx + 1).replace(/}\s*$/, "");
    for (const part of inner.split(",")) {
      const token = part.trim();
      if (!token) continue;
      const m = /^dx:\s*(-?\d+(?:\.\d+)?)/.exec(token);
      if (m) dx = Math.round(parseFloat(m[1]!));
      const m2 = /^dy:\s*(-?\d+(?:\.\d+)?)/.exec(token);
      if (m2) dy = Math.round(parseFloat(m2[1]!));
      const mx = /^x':\s*(-?\d+(?:\.\d+)?)/.exec(token);
      if (mx) dx = Math.round(parseFloat(mx[1]!));
      const my = /^y':\s*(-?\d+(?:\.\d+)?)/.exec(token);
      if (my) dy = Math.round(parseFloat(my[1]!));
      const roleMatch = /^role:\s*(.+)$/.exec(token);
      if (roleMatch) {
        let roleToken = roleMatch[1]!.trim();
        if (roleToken.startsWith('"')) {
          roleToken = parseQuotedValue(roleToken);
        } else {
          roleToken = roleToken.split(/\s/)[0]!;
        }
        role = roleToken;
      }
    }
  }
  return { personId, type, role, dx, dy };
}

function parseUnionBlock(header: string, bodyLines: string[]): ParsedUnionBlock | null {
  const headerMatch = /^Union\s+(\S+)\s*\{?\s*$/.exec(header.trim());
  if (!headerMatch) return null;
  const unionId = headerMatch[1]!;

  const block: ParsedUnionBlock = {
    unionId,
    notes: "",
    members: [],
  };

  for (const raw of bodyLines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const member = parsePersonMemberLine(line);
    if (member) {
      block.members.push(member);
      continue;
    }

    const keyMatch = /^(\w+):\s*(.+)$/.exec(line);
    if (!keyMatch) continue;
    const key = keyMatch[1]!;
    const val = keyMatch[2]!.trim();

    if (key === "x") {
      const cv = parseCoordValue(val);
      if (cv === "unset") block.positionUnset = true;
      else if (typeof cv === "number") {
        block.position = { ...(block.position ?? { x: 0, y: 0 }), x: cv };
      }
    } else if (key === "y") {
      const cv = parseCoordValue(val);
      if (cv === "unset") block.positionUnset = true;
      else if (typeof cv === "number") {
        block.position = { ...(block.position ?? { x: 0, y: 0 }), y: cv };
      }
    } else if (key === "style") {
      block.styleName = parseQuotedValue(val);
    } else if (key === "name") {
      block.name = parseQuotedValue(val);
    } else if (key === "mainGraph") {
      block.mainGraph = val === "true";
    } else if (key === "arrange") {
      block.arrange = parseArrangeTag(val);
    } else if (key === "notes") {
      block.notes = parseQuotedValue(val);
    }
  }

  return block;
}

function parseBranchBlock(header: string, bodyLines: string[]): ParsedBranchBlock | null {
  const headerMatch =
    /^Branch\s+(\S+)(?:\s+"((?:\\.|[^"\\])*)")?(?:\s+root:\s*(\S+))?(?:\s+mode:\s*(hidden|tab))?\s*\{?\s*$/i.exec(
      header.trim()
    );
  if (!headerMatch) return null;

  const block: ParsedBranchBlock = {
    id: headerMatch[1]!,
    name: headerMatch[2]?.replace(/\\"/g, '"') ?? "",
    rootPersonId: headerMatch[3] ?? "",
    mode: (headerMatch[4]?.toLowerCase() as "hidden" | "tab") ?? "tab",
    description: "",
    unionIds: [],
  };

  for (const raw of bodyLines) {
    const line = raw.trim();
    if (!line) continue;
    const unionsMatch = /^unions:\s*\[([^\]]*)\]/.exec(line);
    if (unionsMatch) {
      block.unionIds = unionsMatch[1]!
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const descVal = parseFieldValue(line, "description");
    if (descVal) block.description = parseQuotedValue(descVal);
  }

  return block;
}

function readBlockFromLines(
  rawLines: string[],
  startIndex: number
): { header: string; body: string[]; nextIndex: number } {
  let lineIndex = startIndex;
  let header = rawLines[lineIndex]?.trim() ?? "";
  lineIndex++;

  const inlineBrace = header.endsWith("{");
  if (inlineBrace) header = header.slice(0, -1).trim();

  const body: string[] = [];
  if (inlineBrace || header.includes("{")) {
    while (lineIndex < rawLines.length) {
      const innerLine = rawLines[lineIndex]!.trim().replace(/,$/, "");
      lineIndex++;
      if (innerLine === "}" || innerLine === "},") break;
      if (innerLine) body.push(innerLine);
    }
  }

  return { header, body, nextIndex: lineIndex };
}

function resolveGenAnchorId(
  genIndex: number | undefined,
  generationAnchors: GenerationAnchor[]
): string | undefined {
  if (genIndex === undefined || generationAnchors.length === 0) return undefined;
  const sorted = [...generationAnchors].sort((a, b) => a.index - b.index);
  return sorted[genIndex]?.id;
}

export function parseFamilyTreeScript(
  text: string,
  existingNodes: Node<FamilyTreeNodeData>[],
  _existingEdges: Edge[],
  existingConnectionStyles: ConnectionStyleDef[],
  generationAnchors: GenerationAnchor[] = [],
  existingBranches: BranchRecord[] = []
): ParsedFamilyTreeScript {
  const errors: string[] = [];
  const rawLines = text.split("\n");

  const connectionStyles: ConnectionStyleDef[] = [];
  const styleIds = new Set<string>();
  const personRecords = new Map<string, ParsedPersonDeclaration>();
  const unionBlocks: ParsedUnionBlock[] = [];
  const branchBlocks: ParsedBranchBlock[] = [];

  let section: "none" | "declarations" | "familyTree" | "branches" = "none";
  let lineIndex = 0;

  while (lineIndex < rawLines.length) {
    const raw = rawLines[lineIndex]!;
    const line = raw.trim();
    lineIndex++;

    if (!line || line.startsWith("#")) continue;

    if (line === "@declarations") {
      section = "declarations";
      continue;
    }
    if (line === "@familyTree") {
      section = "familyTree";
      continue;
    }
    if (line === "@branches") {
      section = "branches";
      continue;
    }

    if (section === "none" && line.startsWith("@") && line.includes('"')) {
      const style = parseConnectionStyleLine(line);
      if (style) {
        if (styleIds.has(style.id)) {
          errors.push(`Duplicate connection style id ${style.id}`);
        } else {
          connectionStyles.push(style);
          styleIds.add(style.id);
        }
      } else {
        errors.push(`Invalid connection style line: ${line}`);
      }
      continue;
    }

    if (section === "declarations") {
      if (line.startsWith("Person ")) {
        const { header, body, nextIndex } = readBlockFromLines(rawLines, lineIndex - 1);
        lineIndex = nextIndex;
        const idMatch = /^Person\s+(\S+)/.exec(header);
        if (!idMatch) continue;
        const id = idMatch[1]!;
        const parsed = parsePersonBlockFields(body);
        const genAnchorId = resolveGenAnchorId(parsed.genIndex, generationAnchors);
        if (personRecords.has(id)) {
          errors.push(`Duplicate person id in declarations: ${id}`);
        } else {
          personRecords.set(id, {
            id,
            data: {
              ...personDataFromFields(parsed.fields, genAnchorId),
              positionUnset: parsed.positionUnset,
            },
            ...(parsed.position && !parsed.positionUnset && { position: parsed.position }),
            ...(parsed.positionUnset && { positionUnset: true }),
          });
        }
      }
      continue;
    }

    if (section === "familyTree") {
      if (line.startsWith("Union ")) {
        const { header, body, nextIndex } = readBlockFromLines(rawLines, lineIndex - 1);
        lineIndex = nextIndex;
        const block = parseUnionBlock(header, body);
        if (block) unionBlocks.push(block);
      }
      continue;
    }

    if (section === "branches") {
      if (line.startsWith("Branch ")) {
        const { header, body, nextIndex } = readBlockFromLines(rawLines, lineIndex - 1);
        lineIndex = nextIndex;
        const block = parseBranchBlock(header, body);
        if (block) branchBlocks.push(block);
      }
      continue;
    }
  }

  if (connectionStyles.length === 0 && existingConnectionStyles.length > 0) {
    connectionStyles.push(...existingConnectionStyles);
  }

  const styleByName = new Map(connectionStyles.map((s) => [s.name, s.id]));
  const existingById = new Map(existingNodes.map((n) => [n.id, n]));

  const nodes: Node<FamilyTreeNodeData>[] = [];
  const edges: Edge[] = [];

  for (const block of unionBlocks) {
    const existingUnion = existingById.get(block.unionId);
    const styleId = block.styleName ? styleByName.get(block.styleName) : undefined;
    if (block.styleName && !styleId) {
      errors.push(`Unknown connection style "${block.styleName}" for union ${block.unionId}`);
    }

    const partnerMembers: ParsedUnionMember[] = [];
    const childMembers: ParsedUnionMember[] = [];

    for (const m of block.members) {
      if (m.type.toLowerCase() === "child") {
        childMembers.push(m);
      } else {
        partnerMembers.push(m);
      }
    }

    const partners = partnerMembers.map((m) => ({
      personId: m.personId,
      role: (m.type === "parent" ? undefined : m.type) as ParentRole | undefined,
    }));

    if (partners.length === 0 && childMembers.length === 0) {
      const unionData: UnionNodeData = {
        kind: "union",
        name: block.name ?? (existingUnion?.data as UnionNodeData)?.name,
        partnerIds: [null, null],
        notes: block.notes || (existingUnion?.data as UnionNodeData)?.notes || "",
        unionType: "forward",
        connectionStyleId: styleId,
        arrangeSpacing: block.arrange,
        isMainGraph: block.mainGraph ?? (existingUnion?.data as UnionNodeData)?.isMainGraph,
        createdAt: (existingUnion?.data as UnionNodeData)?.createdAt ?? Date.now(),
        positionUnset: block.positionUnset,
      };
      const unionPosition =
        block.positionUnset || !block.position
          ? existingUnion?.position ?? { x: 100, y: 100 }
          : block.position;
      nodes.push({
        id: block.unionId,
        type: "union",
        position: unionPosition,
        data: unionData,
      });
      continue;
    }

    const partnerIds = partners.map((p) => p.personId);
    if (new Set(partnerIds).size !== partnerIds.length) {
      errors.push(`Union ${block.unionId}: duplicate partner ids`);
      continue;
    }

    const baseUnionData: UnionNodeData = {
      kind: "union",
      name: block.name ?? (existingUnion?.data as UnionNodeData)?.name,
      partnerIds: [null, null],
      notes: block.notes || (existingUnion?.data as UnionNodeData)?.notes || "",
      unionType: "forward",
      connectionStyleId: styleId,
      arrangeSpacing: block.arrange,
      isMainGraph: block.mainGraph ?? (existingUnion?.data as UnionNodeData)?.isMainGraph,
      createdAt: (existingUnion?.data as UnionNodeData)?.createdAt ?? Date.now(),
      positionUnset: block.positionUnset,
    };
    const unionData = withUnionPartners(baseUnionData, partners);

    let unionPosition =
      block.positionUnset || !block.position
        ? existingUnion?.position
        : block.position;

    const resolveMemberPosition = (
      member: ParsedUnionMember,
      fallback: { x: number; y: number }
    ): { x: number; y: number; positionUnset?: boolean } => {
      if (block.positionUnset) return { ...fallback, positionUnset: true };
      if (member.dx != null && member.dy != null && unionPosition) {
        return { x: unionPosition.x + member.dx, y: unionPosition.y + member.dy };
      }
      if (member.rx != null && member.ry != null && unionPosition) {
        return { x: unionPosition.x + member.rx, y: unionPosition.y + member.ry };
      }
      return fallback;
    };

    let personLayoutIndex = nodes.filter((n) => n.data.kind === "person").length;
    const partnerPositions: { x: number; y: number }[] = [];
    for (const partner of partners) {
      const rec = personRecords.get(partner.personId);
      const existing = existingById.get(partner.personId);
      const member =
        block.members.find((m) => m.personId === partner.personId) ??
        ({ personId: partner.personId, type: "parent" } as ParsedUnionMember);
      const pos = resolveMemberPosition(
        member,
        rec?.position ??
          existing?.position ??
          defaultPersonPosition(existingNodes, personLayoutIndex++)
      );
      partnerPositions.push(pos);
    }

    if (!unionPosition && partnerPositions.length > 0) {
      unionPosition = unionPositionBetween(partnerPositions);
    }

    nodes.push({
      id: block.unionId,
      type: "union",
      position: unionPosition ?? { x: 100, y: 100 },
      data: unionData,
    });

    const applyMemberPosition = (personId: string, member: ParsedUnionMember | undefined) => {
      const rec = personRecords.get(personId);
      if (!rec) return;
      const pos = resolveMemberPosition(
        member ?? { personId, type: "child" },
        rec.position ?? existingById.get(personId)?.position ?? defaultPersonPosition([], 0)
      );
      if (pos.positionUnset || block.positionUnset) {
        rec.data.positionUnset = true;
        rec.positionUnset = true;
        delete rec.position;
      } else {
        rec.position = { x: pos.x, y: pos.y };
      }
    };

    partners.forEach((partner, index) => {
      applyMemberPosition(
        partner.personId,
        block.members.find((m) => m.personId === partner.personId)
      );
      edges.push({
        id: `e-${partner.personId}-${block.unionId}`,
        source: partner.personId,
        target: block.unionId,
        sourceHandle: "partner",
        targetHandle: `partner-${index}`,
        data: { type: "partner" },
      });
    });

    for (const child of childMembers) {
      applyMemberPosition(child.personId, child);
      edges.push({
        id: `e-${block.unionId}-${child.personId}`,
        source: block.unionId,
        target: child.personId,
        sourceHandle: "children",
        targetHandle: "parent",
        data: {
          type: "child",
          ...(child.role ? { childRole: child.role } : {}),
        },
      });
    }
  }

  if (errors.length > 0) {
    return {
      nodes: existingNodes,
      edges: _existingEdges,
      connectionStyles: existingConnectionStyles,
      branches: existingBranches,
      errors,
    };
  }

  let newPersonIndex = 0;
  for (const [id, rec] of personRecords) {
    if (nodes.some((n) => n.id === id)) continue;
    const existing = existingById.get(id);
    nodes.push({
      id,
      type: "person",
      position:
        rec.positionUnset || !rec.position
          ? existing?.position ?? defaultPersonPosition([...existingNodes, ...nodes], newPersonIndex++)
          : rec.position,
      data: rec.data,
    });
  }

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (n.data.kind !== "person") continue;
    const rec = personRecords.get(n.id);
    if (rec?.position && !rec.positionUnset) {
      nodes[i] = { ...n, position: rec.position };
    }
    if (rec?.positionUnset || rec?.data.positionUnset) {
      nodes[i] = {
        ...n,
        data: { ...n.data, positionUnset: true } as PersonNodeData,
      };
    }
  }

  const branches: BranchRecord[] =
    branchBlocks.length > 0
      ? branchBlocks.map((b) => {
          const existing = existingBranches.find((x) => x.id === b.id);
          return {
            id: b.id,
            name: b.name || existing?.name || "Branch",
            description: b.description || existing?.description || "",
            mode: b.mode,
            rootPersonId: b.rootPersonId || existing?.rootPersonId || "",
            familyId: existing?.familyId ?? null,
            createdAt: existing?.createdAt ?? Date.now(),
          };
        })
      : existingBranches;

  const keptPersonIds = new Set(nodes.filter((n) => n.data.kind === "person").map((n) => n.id));
  const keptUnionIds = new Set(nodes.filter((n) => n.data.kind === "union").map((n) => n.id));

  const prunedNodes = nodes.filter(
    (n) =>
      (n.data.kind === "person" && keptPersonIds.has(n.id)) ||
      (n.data.kind === "union" && keptUnionIds.has(n.id))
  );

  const prunedEdges = edges.filter((e) => {
    const type = (e.data as { type?: string })?.type;
    if (type === "partner") {
      return keptPersonIds.has(e.source) && keptUnionIds.has(e.target);
    }
    if (type === "child") {
      return keptUnionIds.has(e.source) && keptPersonIds.has(e.target);
    }
    return false;
  });

  return {
    nodes: prunedNodes,
    edges: prunedEdges,
    connectionStyles: connectionStyles.length > 0 ? connectionStyles : existingConnectionStyles,
    branches,
    errors: [],
  };
}

/** Compute ordered union ids for branch serialization (root-parent unions first). */
export function computeBranchUnionIds(
  rootPersonId: string,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const addDownward = (personId: string) => {
    for (const unionId of edges
      .filter((e) => isPartnerEdge(e) && e.source === personId)
      .map((e) => e.target)) {
      if (seen.has(unionId)) continue;
      seen.add(unionId);
      result.push(unionId);

      const childIds = edges
        .filter((e) => e.source === unionId && isChildEdge(e))
        .map((e) => e.target);
      for (const childId of childIds) {
        addDownward(childId);
      }

      const unionNode = nodes.find((n) => n.id === unionId);
      if (unionNode) {
        const d = unionNode.data as UnionNodeData;
        const partnerIds = [d.leftPartnerId, d.rightPartnerId, ...(d.partnerIds ?? [])].filter(
          (pid): pid is string => pid != null && pid !== personId
        );
        for (const pid of partnerIds) addDownward(pid);
      }
    }
  };

  addDownward(rootPersonId);
  return result;
}
