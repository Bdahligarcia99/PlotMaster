import type { NeuronPaneRef } from "./paneTypes";
import { paneIdFromRef } from "./paneTypes";
import type { NeuronMirrorNode } from "./mirror/types";
import type { ProjectData } from "../storage/StorageDriver";
import { isTimelineProjectPayload } from "../storage/StorageDriver";
import { getMirrorAdapter } from "./mirror/index";
import { MODULE_TYPE_NAME_TO_REGISTRY_ID } from "../home/moduleRegistry";

export { paneIdFromRef };

export function parsePaneId(id: string): { kind: "user"; docId: string } | { kind: "mirror"; subId: string; entityId: string } | null {
  if (id.startsWith("user:")) {
    return { kind: "user", docId: id.slice(5) };
  }
  if (id.startsWith("mirror:")) {
    const rest = id.slice(7);
    const lastColon = rest.lastIndexOf(":");
    if (lastColon <= 0) return null;
    return {
      kind: "mirror",
      subId: rest.slice(0, lastColon),
      entityId: rest.slice(lastColon + 1),
    };
  }
  return null;
}

export function resolvePaneRef(
  id: string,
  subProjects: Record<string, string>,
  mirrors: Record<string, ProjectData>
): NeuronPaneRef | null {
  const parsed = parsePaneId(id);
  if (!parsed) return null;
  if (parsed.kind === "user") {
    return { kind: "user", docId: parsed.docId };
  }
  const moduleTypeName = Object.entries(subProjects).find(([, subId]) => subId === parsed.subId)?.[0];
  const registry = moduleTypeName ? MODULE_TYPE_NAME_TO_REGISTRY_ID[moduleTypeName] : null;
  if (!registry) return null;
  const payload = mirrors[parsed.subId];
  const name = getMirrorEntityDisplayName(registry, payload, parsed.entityId, "file");
  return {
    kind: "mirror",
    subId: parsed.subId,
    registryId: registry,
    entityId: parsed.entityId,
    name,
  };
}

export function getMirrorEntityDisplayName(
  registryId: string,
  payload: ProjectData | undefined,
  entityId: string,
  kind: NeuronMirrorNode["kind"]
): string {
  if (!payload) return "Untitled";
  if (kind === "module-root") {
    return getMirrorAdapter(registryId)?.moduleLabel ?? "Module";
  }
  if (registryId === "timeline" && isTimelineProjectPayload(payload)) {
    if (kind === "folder") {
      if (entityId === "__unassigned__") return "Unassigned";
      return payload.folders?.find((f) => f.id === entityId)?.name ?? "Folder";
    }
    return payload.documents?.find((d) => d.id === entityId)?.name ?? "Untitled";
  }
  if ((payload as { moduleType?: string }).moduleType === "familyTree") {
    const ftPayload = payload as import("../storage/StorageDriver").ProjectPayload;
    if (kind === "folder") {
      return ftPayload.families?.find((f) => f.id === entityId)?.name ?? "Family";
    }
    return ftPayload.documents?.find((d) => d.id === entityId)?.name ?? "Untitled";
  }
  return "Untitled";
}

export function collectMirrorFilePaneIds(node: NeuronMirrorNode): string[] {
  const ids: string[] = [];
  if (node.kind === "file") {
    ids.push(paneIdFromRef({
      kind: "mirror",
      subId: node.moduleSubId,
      registryId: node.registryId,
      entityId: node.entityId,
      name: node.name,
    }));
  }
  for (const child of node.children ?? []) {
    ids.push(...collectMirrorFilePaneIds(child));
  }
  return ids;
}

export function collectBinderFilePaneIds(
  folderId: string,
  folders: { id: string; parentId: string | null }[],
  documents: { id: string; folderId: string | null }[]
): string[] {
  const ids: string[] = [];
  for (const doc of documents.filter((d) => d.folderId === folderId)) {
    ids.push(`user:${doc.id}`);
  }
  for (const child of folders.filter((f) => f.parentId === folderId)) {
    ids.push(...collectBinderFilePaneIds(child.id, folders, documents));
  }
  return ids;
}

export function collectAllBinderFilePaneIds(
  documents: { id: string; folderId: string | null }[]
): string[] {
  return documents.map((d) => `user:${d.id}`);
}

export function orderedUnifiedPaneIds(
  unifiedSelectionIds: string[],
  binderDocOrder: string[],
  mirrorTrees: NeuronMirrorNode[]
): string[] {
  const selected = new Set(unifiedSelectionIds);
  const ordered: string[] = [];
  for (const id of binderDocOrder) {
    if (selected.has(id)) ordered.push(id);
  }
  const walkMirror = (node: NeuronMirrorNode) => {
    const id = paneIdFromRef({
      kind: "mirror",
      subId: node.moduleSubId,
      registryId: node.registryId,
      entityId: node.entityId,
      name: node.name,
    });
    if (node.kind === "file" && selected.has(id)) ordered.push(id);
    for (const child of node.children ?? []) walkMirror(child);
  };
  for (const tree of mirrorTrees) walkMirror(tree);
  for (const id of unifiedSelectionIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}
