import type { Node, Edge } from "reactflow";
import {
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
  getPersonDisplayName,
  parsePersonDeclarationMetadata,
} from "./familyTreeStore";

export interface ParsedFamilyTreeScript {
  nodes: Node<FamilyTreeNodeData>[];
  edges: Edge[];
  connectionStyles: ConnectionStyleDef[];
  errors: string[];
}

const generateId = () => `_${Math.random().toString(36).slice(2, 11)}`;

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

function parsePartnerToken(token: string): { name: string; role?: ParentRole } {
  const roleMatch = token.match(/^(.+?)\s+\((father|mother)\)\s*$/i);
  if (roleMatch) {
    return { name: roleMatch[1]!.trim(), role: roleMatch[2]!.toLowerCase() as ParentRole };
  }
  return { name: token.trim() };
}

function parseChildToken(token: string): string {
  return token.replace(/^\s*->\s*/, "").replace(/\s*\{Gen[^}]*\}\s*$/, "").trim();
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

function personDataFromParts(
  first: string,
  middle: string,
  last: string,
  nicknames?: string[],
  genAnchorId?: string
): PersonNodeData {
  const name = [first, middle, last].filter(Boolean).join(" ") || "Person";
  return {
    kind: "person",
    name,
    firstName: first,
    middleName: middle,
    lastName: last,
    notes: "",
    nicknames: nicknames ?? [],
    genAnchorId: genAnchorId ?? null,
    isGenArmed: false,
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
  leftPos: { x: number; y: number },
  rightPos: { x: number; y: number }
) {
  const midX = (leftPos.x + rightPos.x) / 2;
  const unionY = Math.min(leftPos.y, rightPos.y) - UNION_DY;
  return { x: midX - DEFAULT_UNION_W / 2, y: unionY };
}

interface ParsedUnionBlock {
  unionId: string;
  left: { name: string; role?: ParentRole };
  right: { name: string; role?: ParentRole };
  styleName?: string;
  arrange?: UnionArrangeSpacing;
  children: string[];
}

function parseUnionHeader(line: string): Omit<ParsedUnionBlock, "children"> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("@")) return null;
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx === -1) return null;
  const unionId = trimmed.slice(1, colonIdx).trim();
  let rest = trimmed.slice(colonIdx + 1).trim();

  let styleName: string | undefined;
  const styleMatch = rest.match(/\s*\[style:\s*"([^"]*)"\]/);
  if (styleMatch) {
    styleName = styleMatch[1];
    rest = rest.replace(styleMatch[0], "");
  }

  let arrange: UnionArrangeSpacing | undefined;
  const arrangeMatch = rest.match(/\s*\[arrange:\s*([^\]]+)\]/);
  if (arrangeMatch) {
    arrange = parseArrangeTag(arrangeMatch[1]!);
    rest = rest.replace(arrangeMatch[0], "");
  }

  rest = rest.replace(/\s*\{Gen[^}]*\}/, "").trim();
  rest = rest.replace(/\s*\{$/, "").trim();

  const arrowIdx = rest.indexOf("<=>");
  if (arrowIdx === -1) return null;
  const leftRaw = rest.slice(0, arrowIdx).trim();
  const rightRaw = rest.slice(arrowIdx + 3).trim();
  if (!leftRaw || !rightRaw) return null;

  return {
    unionId,
    left: parsePartnerToken(leftRaw),
    right: parsePartnerToken(rightRaw),
    styleName,
    arrange,
  };
}

export function parseFamilyTreeScript(
  text: string,
  existingNodes: Node<FamilyTreeNodeData>[],
  _existingEdges: Edge[],
  existingConnectionStyles: ConnectionStyleDef[],
  generationAnchors: GenerationAnchor[] = []
): ParsedFamilyTreeScript {
  const errors: string[] = [];
  const rawLines = text.split("\n");

  const connectionStyles: ConnectionStyleDef[] = [];
  const styleIds = new Set<string>();
  const personRecords = new Map<
    string,
    { data: PersonNodeData; position?: { x: number; y: number } }
  >();
  const unionBlocks: ParsedUnionBlock[] = [];

  let section: "none" | "declarations" | "familyTree" = "none";
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
      const meta = parsePersonDeclarationMetadata(line, generationAnchors);
      if (meta) {
        if (personRecords.has(meta.id)) {
          errors.push(`Duplicate person id in declarations: ${meta.id}`);
        } else {
          personRecords.set(meta.id, {
            data: personDataFromParts(
              meta.firstName ?? "",
              meta.middleName ?? "",
              meta.lastName ?? "",
              meta.nicknames,
              meta.genAnchorId
            ),
            ...(meta.position && { position: meta.position }),
          });
        }
      } else if (line.startsWith("Union ")) {
        const unionDeclId = line.slice(6).trim().split(/\s/)[0];
        if (unionDeclId) {
          /* union position blocks ignored in non-nodeInfo mode */
        }
      }
      continue;
    }

    if (section === "familyTree") {
      const header = parseUnionHeader(line);
      if (!header) continue;

      const block: ParsedUnionBlock = { ...header, children: [] };

      if (line.endsWith("{")) {
        while (lineIndex < rawLines.length) {
          const inner = rawLines[lineIndex]!.trim();
          lineIndex++;
          if (inner === "}") break;
          if (inner.startsWith("children:")) {
            const childPart = inner.slice("children:".length).trim();
            const tokens = childPart.split(",").map((t) => parseChildToken(t)).filter(Boolean);
            block.children.push(...tokens);
          }
        }
      }

      unionBlocks.push(block);
    }
  }

  if (connectionStyles.length === 0 && existingConnectionStyles.length > 0) {
    connectionStyles.push(...existingConnectionStyles);
  }

  const styleByName = new Map(connectionStyles.map((s) => [s.name, s.id]));
  const existingById = new Map(existingNodes.map((n) => [n.id, n]));

  const resolvePersonByName = (displayName: string): string | null => {
    const matches: string[] = [];
    for (const [id, rec] of personRecords) {
      const nodesArr = [...personRecords.entries()].map(([pid, r]) => ({
        id: pid,
        data: r.data,
        position: existingById.get(pid)?.position ?? { x: 0, y: 0 },
        type: "person" as const,
      }));
      const name = getPersonDisplayName(rec.data, id, nodesArr);
      if (name === displayName) matches.push(id);
    }
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) {
      errors.push(`Ambiguous person name "${displayName}" — add explicit # id: in declarations`);
      return null;
    }
    return null;
  };

  const ensurePerson = (displayName: string): string | null => {
    const existing = resolvePersonByName(displayName);
    if (existing) return existing;

    const parts = displayName.split(/\s+/);
    const first = parts[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1]! : "";
    const middle = parts.length > 2 ? parts.slice(1, -1).join(" ") : "";
    const id = generateId();
    personRecords.set(id, {
      data: personDataFromParts(first, middle, last),
    });
    return id;
  };

  const nodes: Node<FamilyTreeNodeData>[] = [];
  const edges: Edge[] = [];

  for (const block of unionBlocks) {
    const leftId = ensurePerson(block.left.name);
    const rightId = ensurePerson(block.right.name);
    if (!leftId || !rightId) continue;

    if (leftId === rightId) {
      errors.push(`Union ${block.unionId}: left and right partners must differ`);
      continue;
    }

    for (const childName of block.children) {
      ensurePerson(childName);
    }

    const existingUnion = existingById.get(block.unionId);
    const styleId = block.styleName ? styleByName.get(block.styleName) : undefined;
    if (block.styleName && !styleId) {
      errors.push(`Unknown connection style "${block.styleName}" for union ${block.unionId}`);
    }

    const unionData: UnionNodeData = {
      kind: "union",
      partnerIds: [leftId, rightId],
      leftPartnerId: leftId,
      rightPartnerId: rightId,
      leftPartnerRole: block.left.role,
      rightPartnerRole: block.right.role,
      notes: (existingUnion?.data as UnionNodeData)?.notes ?? "",
      unionType: "forward",
      connectionStyleId: styleId,
      arrangeSpacing: block.arrange,
      createdAt: (existingUnion?.data as UnionNodeData)?.createdAt ?? Date.now(),
    };

    const leftExisting = existingById.get(leftId);
    const rightExisting = existingById.get(rightId);
    const leftRec = personRecords.get(leftId);
    const rightRec = personRecords.get(rightId);
    const leftPos =
      leftRec?.position ??
      leftExisting?.position ??
      defaultPersonPosition(existingNodes, nodes.filter((n) => n.data.kind === "person").length);
    const rightPos =
      rightRec?.position ??
      rightExisting?.position ??
      defaultPersonPosition(existingNodes, nodes.filter((n) => n.data.kind === "person").length + 1);
    const unionPosition =
      existingUnion?.position ?? unionPositionBetween(leftPos, rightPos);

    nodes.push({
      id: block.unionId,
      type: "union",
      position: unionPosition,
      data: unionData,
    });

    edges.push({
      id: `e-${leftId}-${block.unionId}`,
      source: leftId,
      target: block.unionId,
      sourceHandle: "partner",
      targetHandle: "leftPartner",
      data: { type: "partner" },
    });
    edges.push({
      id: `e-${rightId}-${block.unionId}`,
      source: rightId,
      target: block.unionId,
      sourceHandle: "partner",
      targetHandle: "rightPartner",
      data: { type: "partner" },
    });

    for (const childName of block.children) {
      const childId = ensurePerson(childName);
      if (!childId) continue;
      edges.push({
        id: `e-${block.unionId}-${childId}`,
        source: block.unionId,
        target: childId,
        sourceHandle: "children",
        targetHandle: "parent",
        data: { type: "child" },
      });
    }
  }

  if (errors.length > 0) {
    return {
      nodes: existingNodes,
      edges: _existingEdges,
      connectionStyles: existingConnectionStyles,
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
        rec.position ??
        existing?.position ??
        defaultPersonPosition([...existingNodes, ...nodes], newPersonIndex++),
      data: rec.data,
    });
  }

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (n.data.kind !== "person") continue;
    const rec = personRecords.get(n.id);
    if (rec?.position) {
      nodes[i] = { ...n, position: rec.position };
    }
  }

  const keptPersonIds = new Set(
    nodes.filter((n) => n.data.kind === "person").map((n) => n.id)
  );
  const keptUnionIds = new Set(
    nodes.filter((n) => n.data.kind === "union").map((n) => n.id)
  );

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
    connectionStyles:
      connectionStyles.length > 0 ? connectionStyles : existingConnectionStyles,
    errors: [],
  };
}
