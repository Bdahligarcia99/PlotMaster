import type { ProjectPayload } from "../../storage/StorageDriver";
import type { NeuronMirrorNode, NeuronModuleMirrorAdapter } from "./types";
import { emojiIcon } from "./types";

function isFamilyTreePayload(payload: unknown): payload is ProjectPayload {
  return (payload as ProjectPayload)?.moduleType === "familyTree";
}

function docsForFamily(
  documents: ProjectPayload["documents"],
  familyId: string
): NonNullable<ProjectPayload["documents"]> {
  return (documents ?? []).filter((d) => d.familyId === familyId);
}

export const familyTreeMirrorAdapter: NeuronModuleMirrorAdapter = {
  registryId: "familyTree",
  moduleLabel: "Family Tree",
  defaultModuleIcon: emojiIcon("👪"),

  buildTree(subId, payload) {
    if (!isFamilyTreePayload(payload)) {
      return {
        id: `mirror-${subId}-root`,
        kind: "module-root",
        name: "Family Tree",
        moduleSubId: subId,
        registryId: "familyTree",
        entityId: "root",
        defaultIcon: emojiIcon("👪"),
        children: [],
      };
    }

    const families = payload.families ?? [];

    const folderNodes: NeuronMirrorNode[] = families.map((family) => {
      const familyDocs = docsForFamily(payload.documents, family.id);
      return {
        id: `mirror-${subId}-folder-${family.id}`,
        kind: "folder",
        name: family.name || "Family",
        moduleSubId: subId,
        registryId: "familyTree",
        entityId: family.id,
        children: familyDocs.map((doc) => ({
          id: `mirror-${subId}-file-${doc.id}`,
          kind: "file" as const,
          name: doc.name,
          moduleSubId: subId,
          registryId: "familyTree",
          entityId: doc.id,
          content: doc.content,
        })),
      };
    });

    return {
      id: `mirror-${subId}-root`,
      kind: "module-root",
      name: "Family Tree",
      moduleSubId: subId,
      registryId: "familyTree",
      entityId: "root",
      defaultIcon: emojiIcon("👪"),
      children: folderNodes,
    };
  },

  renameEntity(payload, entityId, kind, name) {
    if (!isFamilyTreePayload(payload)) return payload;
    if (kind === "folder") {
      return {
        ...payload,
        families: (payload.families ?? []).map((f) =>
          f.id === entityId ? { ...f, name, isCustomName: true } : f
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
    if (!isFamilyTreePayload(payload)) return payload;
    return {
      ...payload,
      documents: (payload.documents ?? []).map((d) =>
        d.id === entityId ? { ...d, content, updatedAt: Date.now() } : d
      ),
    };
  },
};
