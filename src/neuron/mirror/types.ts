import type { ProjectData } from "../../storage/StorageDriver";
import type { NeuronIconRef } from "../../storage/StorageDriver";

export type NeuronMirrorNodeKind = "module-root" | "folder" | "file";

export interface NeuronMirrorNode {
  id: string;
  kind: NeuronMirrorNodeKind;
  name: string;
  moduleSubId: string;
  registryId: string;
  entityId: string;
  content?: string;
  defaultIcon?: NeuronIconRef;
  children?: NeuronMirrorNode[];
}

export interface NeuronModuleMirrorAdapter {
  registryId: string;
  moduleLabel: string;
  defaultModuleIcon: NeuronIconRef;
  buildTree(subId: string, payload: ProjectData): NeuronMirrorNode;
  renameEntity(payload: ProjectData, entityId: string, kind: NeuronMirrorNodeKind, name: string): ProjectData;
  writeFileContent(payload: ProjectData, entityId: string, content: string): ProjectData;
}

export function mirrorKey(subId: string, entityId: string): string {
  return `${subId}:${entityId}`;
}

export function emojiIcon(value: string): NeuronIconRef {
  return { kind: "emoji", value };
}
