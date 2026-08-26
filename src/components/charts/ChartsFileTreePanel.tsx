import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useChartsStore } from "../../store/chartsStore";
import type { ChartsEntryKind } from "../../store/chartsDocumentHelpers";

interface ChartsFileTreePanelProps {
  openFileIds: string[];
  activeFileId: string | null;
  dirtyDocIds: Set<string>;
  onOpenFile: (docId: string) => void;
  onNewUserFile: (kind: ChartsEntryKind, folderId?: string) => void;
  onDeleteUserFile: (docId: string) => void;
  onRequestNewFolder: (kind: ChartsEntryKind) => void;
  onRequestFolderDelete: (folderId: string, folderName: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onKindMismatch: (message: string) => void;
}

function FolderDropTarget({
  folderId,
  name,
  kind,
  isActive,
  isExpanded,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onSelect,
  onToggleExpand,
  onStartRename,
  onDelete,
  onNewFile,
  children,
}: {
  folderId: string;
  name: string;
  kind: ChartsEntryKind;
  isActive: boolean;
  isExpanded: boolean;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onSelect: () => void;
  onToggleExpand: () => void;
  onStartRename: () => void;
  onDelete: () => void;
  onNewFile: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-folder-${folderId}`,
    data: { folderId },
  });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border ${
        isOver ? "border-blue-500/60 bg-blue-500/10" : "border-dark-accent/40"
      } ${isActive ? "ring-1 ring-blue-500/40" : ""}`}
    >
      <div className="flex items-center gap-1 px-2 py-1.5 bg-dark-accent/20">
        <button type="button" onClick={onToggleExpand} className="text-dark-muted hover:text-dark-text p-0.5">
          {isExpanded ? "▾" : "▸"}
        </button>
        {isRenaming ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameCommit();
              if (e.key === "Escape") onRenameCancel();
            }}
            className="flex-1 min-w-0 px-1 py-0.5 text-xs bg-dark-bg border border-blue-500 rounded text-dark-text"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={onSelect}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
            className="flex-1 min-w-0 text-left text-xs font-medium text-dark-text truncate"
          >
            {name}
            <span className="ml-1 text-[10px] text-dark-muted">({kind})</span>
          </button>
        )}
        <button
          type="button"
          onClick={onNewFile}
          className="text-[10px] text-blue-300 hover:text-blue-200 px-1"
          title="New file in this folder"
        >
          + File
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-dark-muted hover:text-red-400 px-1"
          title="Delete folder"
        >
          ×
        </button>
      </div>
      {isExpanded && <div className="py-1">{children}</div>}
    </div>
  );
}

function DraggableFileRow({
  docId,
  name,
  isActive,
  isOpen,
  dirty,
  onOpen,
  onDelete,
}: {
  docId: string;
  name: string;
  isActive: boolean;
  isOpen: boolean;
  dirty: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${docId}`,
    data: { docId },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-3 py-1.5 mx-1 rounded cursor-pointer text-xs ${
        isDragging ? "opacity-40" : ""
      } ${
        isActive
          ? "bg-blue-500/20 text-dark-text ring-1 ring-blue-500/40"
          : "text-dark-muted hover:bg-dark-accent/30 hover:text-dark-text"
      }`}
      onClick={onOpen}
    >
      <span className="flex-1 truncate">
        {isOpen ? "● " : ""}
        {name}
        {dirty ? " ·" : ""}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="text-dark-muted hover:text-red-400 shrink-0"
      >
        ×
      </button>
    </div>
  );
}

export default function ChartsFileTreePanel({
  openFileIds,
  activeFileId,
  dirtyDocIds,
  onOpenFile,
  onNewUserFile,
  onDeleteUserFile,
  onRequestNewFolder,
  onRequestFolderDelete,
  onRenameFolder,
  onKindMismatch,
}: ChartsFileTreePanelProps) {
  const folders = useChartsStore((s) => s.folders);
  const documents = useChartsStore((s) => s.documents);
  const activeFolderId = useChartsStore((s) => s.activeFolderId);
  const setActiveFolderId = useChartsStore((s) => s.setActiveFolderId);
  const moveDocument = useChartsStore((s) => s.moveDocument);

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [newFolderKind, setNewFolderKind] = useState<ChartsEntryKind>("chart");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [folders]
  );

  const docsByFolder = useMemo(() => {
    const map = new Map<string, typeof documents>();
    for (const folder of sortedFolders) {
      map.set(
        folder.id,
        documents.filter((d) => d.folderId === folder.id).sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    return map;
  }, [sortedFolders, documents]);

  const isFolderExpanded = (folderId: string) => expandedFolders[folderId] !== false;

  const handleDragStart = (event: DragStartEvent) => {
    const docId = event.active.data.current?.docId as string | undefined;
    if (docId) setDraggingDocId(docId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingDocId(null);
    const docId = event.active.data.current?.docId as string | undefined;
    const targetFolderId = event.over?.data.current?.folderId as string | undefined;
    if (!docId || !targetFolderId) return;
    const doc = documents.find((d) => d.id === docId);
    if (doc?.folderId === targetFolderId) return;
    const result = moveDocument(docId, targetFolderId);
    if (!result.ok && result.reason === "kindMismatch") {
      const folder = folders.find((f) => f.id === targetFolderId);
      const kindLabel = folder?.kind === "layout" ? "layout" : "chart";
      const docLabel = doc?.kind === "layout" ? "Layout" : "Chart";
      onKindMismatch(
        `${docLabel} files can't be moved into a ${kindLabel} folder.`
      );
    }
  };

  return (
    <div className="w-full flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden h-full">
      <div className="p-4 border-b border-dark-accent/50">
        <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
          Sub Entities
        </h2>
        <p className="text-dark-muted text-xs mt-1">Folders → Files</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex items-center justify-end gap-2 px-1 mb-2 flex-wrap">
          <select
            value={newFolderKind}
            onChange={(e) => setNewFolderKind(e.target.value as ChartsEntryKind)}
            className="text-[11px] bg-dark-bg border border-dark-accent rounded px-1 py-0.5 text-dark-text"
          >
            <option value="chart">Chart folder</option>
            <option value="layout">Layout folder</option>
          </select>
          <button
            type="button"
            onClick={() => onRequestNewFolder(newFolderKind)}
            className="text-[11px] text-blue-300 hover:text-blue-200 px-1.5 py-0.5"
          >
            + Folder
          </button>
        </div>
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {sortedFolders.length === 0 ? (
            <p className="text-dark-muted text-xs py-2 px-2">No folders yet.</p>
          ) : (
            <div className="space-y-2">
              {sortedFolders.map((folder) => (
                <FolderDropTarget
                  key={folder.id}
                  folderId={folder.id}
                  name={folder.name}
                  kind={folder.kind}
                  isActive={activeFolderId === folder.id}
                  isExpanded={isFolderExpanded(folder.id)}
                  isRenaming={renamingFolderId === folder.id}
                  renameValue={renameValue}
                  onRenameChange={setRenameValue}
                  onRenameCommit={() => {
                    if (renamingFolderId) onRenameFolder(renamingFolderId, renameValue);
                    setRenamingFolderId(null);
                  }}
                  onRenameCancel={() => setRenamingFolderId(null)}
                  onSelect={() => setActiveFolderId(folder.id)}
                  onToggleExpand={() =>
                    setExpandedFolders((prev) => ({
                      ...prev,
                      [folder.id]: !isFolderExpanded(folder.id),
                    }))
                  }
                  onStartRename={() => {
                    setRenamingFolderId(folder.id);
                    setRenameValue(folder.name);
                  }}
                  onDelete={() => onRequestFolderDelete(folder.id, folder.name)}
                  onNewFile={() => onNewUserFile(folder.kind, folder.id)}
                >
                  {(docsByFolder.get(folder.id) ?? []).length === 0 ? (
                    <p className="text-dark-muted text-[10px] px-2 py-1">No files</p>
                  ) : (
                    (docsByFolder.get(folder.id) ?? []).map((doc) => (
                      <DraggableFileRow
                        key={doc.id}
                        docId={doc.id}
                        name={doc.name}
                        isActive={activeFileId === doc.id}
                        isOpen={openFileIds.includes(doc.id)}
                        dirty={dirtyDocIds.has(doc.id)}
                        onOpen={() => onOpenFile(doc.id)}
                        onDelete={() => onDeleteUserFile(doc.id)}
                      />
                    ))
                  )}
                </FolderDropTarget>
              ))}
            </div>
          )}
          <DragOverlay>
            {draggingDocId ? (
              <div className="px-3 py-2 bg-dark-surface border border-blue-500/50 rounded text-sm text-dark-text shadow-lg">
                {documents.find((d) => d.id === draggingDocId)?.name ?? "File"}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
