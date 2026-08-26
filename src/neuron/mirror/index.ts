import type { ProjectData } from "../../storage/StorageDriver";
import { ENGRAM_DISPLAY_MODES } from "../../home/displayModes";
import { MODULE_TYPE_NAME_TO_REGISTRY_ID } from "../../home/moduleRegistry";
import { familyTreeMirrorAdapter } from "./familyTreeMirror";
import { timelineMirrorAdapter } from "./timelineMirror";
import type { NeuronMirrorNode, NeuronModuleMirrorAdapter } from "./types";

const ADAPTERS: Record<string, NeuronModuleMirrorAdapter> = {
  timeline: timelineMirrorAdapter,
  familyTree: familyTreeMirrorAdapter,
};

export function getMirrorAdapter(registryId: string): NeuronModuleMirrorAdapter | null {
  return ADAPTERS[registryId] ?? null;
}

export function moduleSupportsTextMirror(moduleTypeName: string): boolean {
  const registryId = MODULE_TYPE_NAME_TO_REGISTRY_ID[moduleTypeName];
  if (!registryId) return false;
  const modes = ENGRAM_DISPLAY_MODES[registryId] ?? [];
  return modes.includes("text");
}

export function buildMirrorTrees(
  subProjects: Record<string, string>,
  mirrors: Record<string, ProjectData>
): NeuronMirrorNode[] {
  const trees: NeuronMirrorNode[] = [];

  for (const [moduleTypeName, subId] of Object.entries(subProjects)) {
    if (!moduleSupportsTextMirror(moduleTypeName)) continue;
    const registryId = MODULE_TYPE_NAME_TO_REGISTRY_ID[moduleTypeName];
    const adapter = registryId ? ADAPTERS[registryId] : null;
    const payload = mirrors[subId];
    if (!adapter || !payload) continue;
    trees.push(adapter.buildTree(subId, payload));
  }

  return trees;
}

export function getAdapterForRegistryId(registryId: string): NeuronModuleMirrorAdapter | null {
  return ADAPTERS[registryId] ?? null;
}

export function writeMirrorFileContent(
  registryId: string,
  payload: ProjectData,
  entityId: string,
  content: string
): ProjectData {
  const adapter = ADAPTERS[registryId];
  if (!adapter) return payload;
  return adapter.writeFileContent(payload, entityId, content);
}

export function renameMirrorEntity(
  registryId: string,
  payload: ProjectData,
  entityId: string,
  kind: NeuronMirrorNode["kind"],
  name: string
): ProjectData {
  const adapter = ADAPTERS[registryId];
  if (!adapter) return payload;
  return adapter.renameEntity(payload, entityId, kind, name);
}

export {
  createMirrorDocument,
  deleteMirrorDocument,
  getMirrorDocumentParentId,
  getMirrorDocumentName,
} from "./mirrorDocumentOps";
