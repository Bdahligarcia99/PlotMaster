import type { Edge, Node } from "reactflow";
import {
  type FamilyGroup,
  type FamilyTreeNodeData,
  generateFamilyTreeScript,
  getFamilyMemberNodeIds,
  getPersonDisplayName,
  getUnionFamilyMemberIds,
  type PersonNodeData,
} from "./familyTreeStore";

export interface FamilyTreeDocumentRecord {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
  /** Owning family tab; inferred from content when absent (legacy). */
  familyId?: string | null;
  role?: "main" | "unassigned";
}

const LEGACY_PERSON_ID_RE = /#\s*id:\s*(_[a-zA-Z0-9]+)/;
const LEGACY_UNION_HEADER_RE = /^@(_[a-zA-Z0-9]+):/;
const PERSON_DECL_RE = /^Person\s+(_[a-zA-Z0-9]+)/;
const UNION_DECL_RE = /^Union\s+(_[a-zA-Z0-9]+)/;

/** Scan legacy-format declaration lines and union headers. */
export function scanLegacyDeclaredIds(content: string): {
  personIds: string[];
  unionIds: string[];
} {
  const personIds = new Set<string>();
  const unionIds = new Set<string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    const personMatch = LEGACY_PERSON_ID_RE.exec(trimmed);
    if (personMatch) personIds.add(personMatch[1]!);
    const unionMatch = LEGACY_UNION_HEADER_RE.exec(trimmed);
    if (unionMatch) unionIds.add(unionMatch[1]!);
  }
  return {
    personIds: Array.from(personIds),
    unionIds: Array.from(unionIds),
  };
}

/** True when document content uses the pre-keyword legacy format. */
export function isLegacyFamilyTreeDocument(content: string): boolean {
  if (!content.trim()) return false;
  if (/^Person\s+_/m.test(content)) return false;
  return LEGACY_PERSON_ID_RE.test(content) || LEGACY_UNION_HEADER_RE.test(content);
}

/** Scan Person/Union keyword blocks in a document. */
export function scanDocumentDeclaredIds(content: string): {
  personIds: string[];
  unionIds: string[];
} {
  if (isLegacyFamilyTreeDocument(content)) {
    return scanLegacyDeclaredIds(content);
  }
  const personIds = new Set<string>();
  const unionIds = new Set<string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    const personMatch = PERSON_DECL_RE.exec(trimmed);
    if (personMatch && personMatch[1] !== "?") personIds.add(personMatch[1]!);
    const unionMatch = UNION_DECL_RE.exec(trimmed);
    if (unionMatch) unionIds.add(unionMatch[1]!);
  }
  return {
    personIds: Array.from(personIds),
    unionIds: Array.from(unionIds),
  };
}

/** Which family tab owns this document. Uses stored familyId when present. */
export function getFamilyIdForDocument(
  doc: FamilyTreeDocumentRecord,
  families: FamilyGroup[],
  _nodes: Node<FamilyTreeNodeData>[],
  _edges: Edge[]
): string | null {
  if (doc.familyId !== undefined) return doc.familyId;

  const { unionIds } = scanDocumentDeclaredIds(doc.content);
  if (unionIds.length === 0) {
    const { personIds } = scanDocumentDeclaredIds(doc.content);
    if (personIds.length === 0) return null;
    const counts = new Map<string | null, number>();
    for (const personId of personIds) {
      let familyId: string | null = null;
      for (const f of families) {
        if (f.memberPersonIds.includes(personId)) {
          familyId = f.id;
          break;
        }
      }
      counts.set(familyId, (counts.get(familyId) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [fid, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        best = fid;
      }
    }
    return best;
  }

  const counts = new Map<string, number>();
  for (const unionId of unionIds) {
    for (const f of families) {
      if (f.unionIds.includes(unionId)) {
        counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
        break;
      }
    }
  }
  let bestFamilyId: string | null = null;
  let bestCount = 0;
  for (const [familyId, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestFamilyId = familyId;
    }
  }
  return bestFamilyId;
}

/** One-time migration: attach familyId/role from content inference. */
export function migrateDocumentOwnership(
  documents: FamilyTreeDocumentRecord[],
  families: FamilyGroup[],
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): FamilyTreeDocumentRecord[] {
  return documents.map((doc) => {
    if (doc.familyId !== undefined) return doc;
    const familyId = getFamilyIdForDocument(doc, families, nodes, edges);
    const isUnassignedName = doc.name === "Unassigned";
    return {
      ...doc,
      familyId,
      role: isUnassignedName ? "unassigned" : "main",
    };
  });
}

/** Next letter suffix for family files: a, b, … z, aa, ab, … */
export function nextDocumentSuffix(existingNames: string[], familyBaseName: string): string {
  const prefix = familyBaseName;
  const used = new Set<string>();
  for (const name of existingNames) {
    if (name.startsWith(prefix) && name.length > prefix.length) {
      used.add(name.slice(prefix.length));
    }
  }
  let n = 0;
  while (true) {
    const suffix = indexToSuffix(n);
    if (!used.has(suffix)) return suffix;
    n++;
  }
}

function indexToSuffix(n: number): string {
  let s = "";
  let x = n;
  do {
    s = String.fromCharCode(97 + (x % 26)) + s;
    x = Math.floor(x / 26) - 1;
  } while (x >= 0);
  return s;
}

/** Build main-file name like "Family 1a". */
export function formatMainDocumentName(familyName: string, suffix: string): string {
  return `${familyName}${suffix}`;
}

/** Declaring doc and docs that reference a node id. */
export function getDocumentRefsForNode(
  nodeId: string,
  documents: FamilyTreeDocumentRecord[]
): { declaredIn: string | null; referencedIn: string[] } {
  let declaredIn: string | null = null;
  const referencedIn: string[] = [];
  const idRe = new RegExp(`(?:^|[^a-zA-Z0-9_])${nodeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-zA-Z0-9_])`);

  for (const doc of documents) {
    const { personIds, unionIds } = scanDocumentDeclaredIds(doc.content);
    if (personIds.includes(nodeId) || unionIds.includes(nodeId)) {
      declaredIn = doc.name;
    } else if (idRe.test(doc.content)) {
      referencedIn.push(doc.name);
    }
  }
  return { declaredIn, referencedIn };
}

export function getDocumentsForFamily(
  documents: FamilyTreeDocumentRecord[],
  familyId: string,
  families: FamilyGroup[],
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): FamilyTreeDocumentRecord[] {
  return documents.filter(
    (d) => getFamilyIdForDocument(d, families, nodes, edges) === familyId
  );
}

export function getUnassignedDocuments(
  documents: FamilyTreeDocumentRecord[],
  families: FamilyGroup[],
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): FamilyTreeDocumentRecord[] {
  return documents.filter(
    (d) => getFamilyIdForDocument(d, families, nodes, edges) === null
  );
}

/** Build a map personId -> document name where that person is declared. */
export function buildPersonDeclarationFileMap(
  documents: FamilyTreeDocumentRecord[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of documents) {
    for (const personId of scanDocumentDeclaredIds(doc.content).personIds) {
      if (!map.has(personId)) map.set(personId, doc.name);
    }
  }
  return map;
}

/** Add `# Name declared in: File` comments before union blocks referencing foreign persons. */
export function annotateForeignReferences(
  scriptText: string,
  scopeIds: Set<string>,
  allDocuments: FamilyTreeDocumentRecord[],
  nodes: Node<FamilyTreeNodeData>[]
): string {
  const declFileMap = buildPersonDeclarationFileMap(allDocuments);
  const personById = new Map(
    nodes.filter((n) => (n.data as { kind?: string }).kind === "person").map((n) => [n.id, n])
  );

  const lines = scriptText.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const unionMatch = UNION_DECL_RE.exec(trimmed);
    if (unionMatch) {
      const annotations: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim() !== "}") {
        const inner = lines[i]!.trim();
        const memberMatch = /^Person\s+(_[a-zA-Z0-9]+)/.exec(inner);
        if (memberMatch) {
          const pid = memberMatch[1]!;
          if (!scopeIds.has(pid)) {
            const personNode = personById.get(pid);
            const name = personNode
              ? getPersonDisplayName(personNode.data as PersonNodeData, pid, nodes)
              : pid;
            const fileName = declFileMap.get(pid);
            if (fileName) annotations.push(`# ${name} declared in: ${fileName}`);
          }
        }
        i++;
      }
      for (const ann of [...new Set(annotations)]) out.push(ann);
      out.push(line);
      if (i < lines.length) {
        out.push(lines[i]!);
        i++;
      }
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

export function previewFamilyDocumentDeleteCounts(content: string): {
  personCount: number;
  unionCount: number;
} {
  const { personIds, unionIds } = scanDocumentDeclaredIds(content);
  return { personCount: personIds.length, unionCount: unionIds.length };
}

function extractScriptSections(content: string): {
  styleLines: string[];
  declarationLines: string[];
  unionLines: string[];
  branchLines: string[];
} {
  const styleLines: string[] = [];
  const declarationLines: string[] = [];
  const unionLines: string[] = [];
  const branchLines: string[] = [];
  let section: "none" | "declarations" | "familyTree" | "branches" = "none";

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      if (section === "declarations") declarationLines.push(line);
      else if (section === "familyTree") unionLines.push(line);
      else if (section === "branches") branchLines.push(line);
      continue;
    }
    if (trimmed === "@declarations") {
      section = "declarations";
      continue;
    }
    if (trimmed === "@familyTree") {
      section = "familyTree";
      continue;
    }
    if (trimmed === "@branches") {
      section = "branches";
      continue;
    }
    if (section === "none" && trimmed.startsWith("@") && trimmed.includes('"')) {
      styleLines.push(line);
      continue;
    }
    if (section === "declarations") declarationLines.push(line);
    else if (section === "familyTree") unionLines.push(line);
    else if (section === "branches") branchLines.push(line);
  }
  return { styleLines, declarationLines, unionLines, branchLines };
}

/** Merge multiple document bodies into one parseable script string. */
export function combineFamilyDocumentContents(
  documents: FamilyTreeDocumentRecord[],
  edits: Map<string, string>
): string {
  const sorted = [...documents].sort((a, b) => a.id.localeCompare(b.id));
  const styleLines: string[] = [];
  const declarationLines: string[] = [];
  const unionLines: string[] = [];
  const branchLines: string[] = [];
  const seenPersonIds = new Set<string>();
  const seenUnionIds = new Set<string>();
  const seenBranchIds = new Set<string>();

  for (const doc of sorted) {
    const content = edits.get(doc.id) ?? doc.content;
    if (!content.trim()) continue;
    const sections = extractScriptSections(content);
    for (const line of sections.styleLines) {
      if (!styleLines.includes(line)) styleLines.push(line);
    }
    for (const line of sections.declarationLines) {
      const m = PERSON_DECL_RE.exec(line.trim()) ?? LEGACY_PERSON_ID_RE.exec(line.trim());
      if (m) {
        if (seenPersonIds.has(m[1]!)) continue;
        seenPersonIds.add(m[1]!);
      }
      declarationLines.push(line);
    }
    for (const line of sections.unionLines) {
      const m = UNION_DECL_RE.exec(line.trim()) ?? LEGACY_UNION_HEADER_RE.exec(line.trim());
      if (m) {
        if (seenUnionIds.has(m[1]!)) continue;
        seenUnionIds.add(m[1]!);
        unionLines.push(line);
        continue;
      }
      unionLines.push(line);
    }
    for (const line of sections.branchLines) {
      const m = /^Branch\s+(_[a-zA-Z0-9]+)/.exec(line.trim());
      if (m) {
        if (seenBranchIds.has(m[1]!)) continue;
        seenBranchIds.add(m[1]!);
        branchLines.push(line);
        continue;
      }
      branchLines.push(line);
    }
  }

  const parts: string[] = [];
  if (styleLines.length > 0) {
    parts.push("# Connection Styles");
    parts.push(...styleLines);
    parts.push("");
  }
  parts.push("@declarations");
  if (declarationLines.length > 0) parts.push(...declarationLines);
  parts.push("");
  parts.push("@familyTree");
  parts.push("");
  if (unionLines.length > 0) parts.push(...unionLines);
  if (branchLines.length > 0) {
    parts.push("@branches");
    parts.push("");
    parts.push(...branchLines);
  }
  return parts.join("\n");
}

export function generateDocumentDisplayContent(
  doc: FamilyTreeDocumentRecord,
  allDocuments: FamilyTreeDocumentRecord[],
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[],
  options: Parameters<typeof generateFamilyTreeScript>[2]
): string {
  const scanned = scanDocumentDeclaredIds(doc.content);
  const scopeIds = new Set<string>([...scanned.personIds, ...scanned.unionIds]);
  if (scopeIds.size === 0) return doc.content;

  for (const unionId of scanned.unionIds) {
    for (const memberId of getUnionFamilyMemberIds(unionId, nodes, edges)) {
      scopeIds.add(memberId);
    }
    scopeIds.add(unionId);
  }

  const raw = generateFamilyTreeScript(nodes, edges, {
    ...options,
    scopeNodeIds: scopeIds,
    includeConnectionStyles: scanned.unionIds.length > 0 || scanned.personIds.length > 0,
  });
  return annotateForeignReferences(raw, scopeIds, allDocuments, nodes);
}

/** Migrate legacy document content to keyword format from the live graph model. */
export function migrateLegacyDocumentContent(
  doc: FamilyTreeDocumentRecord,
  allDocuments: FamilyTreeDocumentRecord[],
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[],
  options: Parameters<typeof generateFamilyTreeScript>[2]
): FamilyTreeDocumentRecord {
  if (!isLegacyFamilyTreeDocument(doc.content)) return doc;
  const legacy = scanLegacyDeclaredIds(doc.content);
  const scopeIds = new Set<string>([...legacy.personIds, ...legacy.unionIds]);
  for (const unionId of legacy.unionIds) {
    for (const memberId of getUnionFamilyMemberIds(unionId, nodes, edges)) {
      scopeIds.add(memberId);
    }
    scopeIds.add(unionId);
  }
  if (scopeIds.size === 0) return doc;
  const content = generateDocumentDisplayContent(
    { ...doc, content: doc.content },
    allDocuments,
    nodes,
    edges,
    options
  );
  return { ...doc, content, updatedAt: Date.now() };
}

export function insertPersonDeclarationAtCursor(
  content: string,
  _cursorPos: number
): { ok: true; content: string; cursorPos: number } | { ok: false; error: string } {
  const id = `_${Math.random().toString(36).slice(2, 11)}`;
  const block = `Person ${id} {
  first: "New"
  middle: ""
  last: "Person"
  nicknames: ""
  notes: ""
  x: ?
  y: ?
}`;
  const declIdx = content.indexOf("@declarations");
  if (declIdx === -1) {
    const full = `@declarations\n${block}\n\n@familyTree\n\n`;
    return { ok: true, content: full, cursorPos: full.indexOf("New") };
  }
  const familyIdx = content.indexOf("@familyTree", declIdx);
  const insertAt =
    familyIdx >= 0 ? familyIdx : declIdx + "@declarations".length + 1;
  const prefix = content.slice(0, insertAt).trimEnd();
  const suffix = content.slice(insertAt);
  const newContent = `${prefix}\n${block}\n${suffix.startsWith("\n") ? "" : "\n"}${suffix}`;
  const newCursor = prefix.length + 1 + block.indexOf("New");
  return { ok: true, content: newContent, cursorPos: newCursor };
}

export function insertUnionBlockAtCursor(
  content: string,
  _cursorPos: number
): { ok: true; content: string; cursorPos: number } | { ok: false; error: string } {
  const id = `_${Math.random().toString(36).slice(2, 11)}`;
  const block = `Union ${id} {
  x: ?
  y: ?
  Person ? type: father
  Person ? type: mother
  notes: ""
}`;
  let base = content;
  if (!base.includes("@familyTree")) {
    base = base.trimEnd() + (base.trim() ? "\n\n" : "") + "@familyTree\n\n";
  }
  const familyIdx = base.indexOf("@familyTree");
  const insertAt = familyIdx + "@familyTree".length + 1;
  const newContent = `${base.slice(0, insertAt)}${block}\n${base.slice(insertAt)}`;
  return { ok: true, content: newContent, cursorPos: insertAt + block.length };
}

export function getScopeIdsForFamily(
  family: FamilyGroup,
  nodes: Node<FamilyTreeNodeData>[],
  edges: Edge[]
): Set<string> {
  const ids = new Set(getFamilyMemberNodeIds(family.unionIds, nodes, edges));
  for (const pid of family.personIds ?? []) ids.add(pid);
  return ids;
}

export function getUnassignedPersonIds(
  families: FamilyGroup[],
  nodes: Node<FamilyTreeNodeData>[]
): string[] {
  const assigned = new Set(families.flatMap((f) => f.memberPersonIds));
  return nodes
    .filter((n) => (n.data as { kind?: string }).kind === "person" && !assigned.has(n.id))
    .map((n) => n.id);
}
