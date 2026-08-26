export type NeuronPaneRef =
  | { kind: "user"; docId: string }
  | {
      kind: "mirror";
      subId: string;
      registryId: string;
      entityId: string;
      name: string;
    };

export interface NeuronEditorPane {
  id: string;
  ref: NeuronPaneRef;
}

export type NeuronDrafts = Record<string, { content: string; dirty: boolean }>;

export function paneIdFromRef(ref: NeuronPaneRef): string {
  if (ref.kind === "user") return `user:${ref.docId}`;
  return `mirror:${ref.subId}:${ref.entityId}`;
}
