import type { TimelineProjectPayload } from "../../storage/StorageDriver";
import type { NeuronMirrorNode, NeuronModuleMirrorAdapter } from "./types";
import { emojiIcon } from "./types";

function isTimelinePayload(payload: unknown): payload is TimelineProjectPayload {
  return (payload as TimelineProjectPayload)?.moduleType === "timeline";
}

export const timelineMirrorAdapter: NeuronModuleMirrorAdapter = {
  registryId: "timeline",
  moduleLabel: "Timeline Outliner",
  defaultModuleIcon: emojiIcon("🗓️"),

  buildTree(subId, payload) {
    if (!isTimelinePayload(payload)) {
      return {
        id: `mirror-${subId}-root`,
        kind: "module-root",
        name: "Timeline Outliner",
        moduleSubId: subId,
        registryId: "timeline",
        entityId: "root",
        defaultIcon: emojiIcon("🗓️"),
        children: [],
      };
    }

    const folders = [...(payload.folders ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const documents = payload.documents ?? [];

    const folderNodes: NeuronMirrorNode[] = folders.map((folder) => ({
      id: `mirror-${subId}-folder-${folder.id}`,
      kind: "folder",
      name: folder.name,
      moduleSubId: subId,
      registryId: "timeline",
      entityId: folder.id,
      children: documents
        .filter((d) => d.folderId === folder.id)
        .map((doc) => ({
          id: `mirror-${subId}-file-${doc.id}`,
          kind: "file" as const,
          name: doc.name,
          moduleSubId: subId,
          registryId: "timeline",
          entityId: doc.id,
          content: doc.content,
        })),
    }));

    const unassigned = documents.filter((d) => !d.folderId || !folders.some((f) => f.id === d.folderId));
    if (unassigned.length > 0) {
      folderNodes.push({
        id: `mirror-${subId}-folder-unassigned`,
        kind: "folder",
        name: "Unassigned",
        moduleSubId: subId,
        registryId: "timeline",
        entityId: "__unassigned__",
        children: unassigned.map((doc) => ({
          id: `mirror-${subId}-file-${doc.id}`,
          kind: "file" as const,
          name: doc.name,
          moduleSubId: subId,
          registryId: "timeline",
          entityId: doc.id,
          content: doc.content,
        })),
      });
    }

    return {
      id: `mirror-${subId}-root`,
      kind: "module-root",
      name: "Timeline Outliner",
      moduleSubId: subId,
      registryId: "timeline",
      entityId: "root",
      defaultIcon: emojiIcon("🗓️"),
      children: folderNodes,
    };
  },

  renameEntity(payload, entityId, kind, name) {
    if (!isTimelinePayload(payload)) return payload;
    if (kind === "folder" && entityId !== "__unassigned__") {
      return {
        ...payload,
        folders: (payload.folders ?? []).map((f) =>
          f.id === entityId ? { ...f, name } : f
        ),
      };
    }
    if (kind === "file") {
      return {
        ...payload,
        documents: (payload.documents ?? []).map((d) =>
          d.id === entityId ? { ...d, name, updatedAt: Date.now() } : d
        ),
      };
    }
    return payload;
  },

  writeFileContent(payload, entityId, content) {
    if (!isTimelinePayload(payload)) return payload;
    return {
      ...payload,
      documents: (payload.documents ?? []).map((d) =>
        d.id === entityId ? { ...d, content, updatedAt: Date.now() } : d
      ),
    };
  },
};
