import { useNeuronStore } from "../../store/neuronStore";
import type { NeuronIconRef } from "../../storage/StorageDriver";
import { mirrorKey } from "../../neuron/mirror/types";

export type NeuronSelectionTarget =
  | { kind: "folder"; id: string; isMirror: false }
  | { kind: "document"; id: string; isMirror: false }
  | {
      kind: "folder" | "file" | "module-root";
      id: string;
      isMirror: true;
      subId: string;
      entityId: string;
      registryId: string;
    };

interface NeuronInspectorProps {
  selection: NeuronSelectionTarget | null;
}

export default function NeuronInspector({ selection }: NeuronInspectorProps) {
  const folders = useNeuronStore((s) => s.folders);
  const documents = useNeuronStore((s) => s.documents);
  const mirrorMeta = useNeuronStore((s) => s.mirrorMeta);
  const renameFolder = useNeuronStore((s) => s.renameFolder);
  const renameDocument = useNeuronStore((s) => s.renameDocument);
  const setFolderSynopsis = useNeuronStore((s) => s.setFolderSynopsis);
  const setDocumentSynopsis = useNeuronStore((s) => s.setDocumentSynopsis);
  const setFolderNotes = useNeuronStore((s) => s.setFolderNotes);
  const setDocumentNotes = useNeuronStore((s) => s.setDocumentNotes);
  const setMirrorMeta = useNeuronStore((s) => s.setMirrorMeta);

  if (!selection) {
    return (
      <div className="p-4 text-sm text-dark-muted">
        Select a folder or file to view properties.
      </div>
    );
  }

  if (!selection.isMirror) {
    if (selection.kind === "folder") {
      const folder = folders.find((f) => f.id === selection.id);
      if (!folder) return null;
      return (
        <InspectorFields
          title={folder.name}
          synopsis={folder.synopsis ?? ""}
          notes={folder.notes ?? ""}
          onTitleChange={(v) => renameFolder(folder.id, v)}
          onSynopsisChange={(v) => setFolderSynopsis(folder.id, v)}
          onNotesChange={(v) => setFolderNotes(folder.id, v)}
          typeLabel="Folder"
        />
      );
    }
    const doc = documents.find((d) => d.id === selection.id);
    if (!doc) return null;
    return (
      <InspectorFields
        title={doc.name}
        synopsis={doc.synopsis ?? ""}
        notes={doc.notes ?? ""}
        onTitleChange={(v) => renameDocument(doc.id, v)}
        onSynopsisChange={(v) => setDocumentSynopsis(doc.id, v)}
        onNotesChange={(v) => setDocumentNotes(doc.id, v)}
        typeLabel="Document"
      />
    );
  }

  const key = mirrorKey(selection.subId, selection.entityId);
  const meta = mirrorMeta[key] ?? {};
  const displayName =
    selection.kind === "module-root"
      ? "Module"
      : selection.kind === "folder"
        ? "Module Folder"
        : "Module File";

  return (
    <InspectorFields
      title={meta.synopsis ? "" : ""}
      synopsis={meta.synopsis ?? ""}
      notes={meta.notes ?? ""}
      onTitleChange={() => {}}
      onSynopsisChange={(v) => setMirrorMeta(key, { synopsis: v })}
      onNotesChange={(v) => setMirrorMeta(key, { notes: v })}
      typeLabel={displayName}
      hideTitle
      mirrorTitle={selection.id}
    />
  );
}

function InspectorFields({
  title,
  synopsis,
  notes,
  onTitleChange,
  onSynopsisChange,
  onNotesChange,
  typeLabel,
  hideTitle,
  mirrorTitle,
}: {
  title: string;
  synopsis: string;
  notes: string;
  onTitleChange: (v: string) => void;
  onSynopsisChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  typeLabel: string;
  hideTitle?: boolean;
  mirrorTitle?: string;
}) {
  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="text-[10px] uppercase tracking-wide text-dark-muted">{typeLabel}</div>
      {!hideTitle ? (
        <div>
          <label className="block text-xs text-dark-muted mb-1">Title / Name</label>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent rounded text-dark-text focus:outline-none focus:border-blue-500"
          />
        </div>
      ) : (
        mirrorTitle && (
          <div className="text-sm text-dark-text font-medium truncate" title={mirrorTitle}>
            {mirrorTitle}
          </div>
        )
      )}
      <div>
        <label className="block text-xs text-dark-muted mb-1">Synopsis</label>
        <textarea
          value={synopsis}
          onChange={(e) => onSynopsisChange(e.target.value)}
          rows={4}
          className="w-full px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent rounded text-dark-text resize-y focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs text-dark-muted mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={6}
          className="w-full px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent rounded text-dark-text resize-y focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}

export type { NeuronIconRef };
