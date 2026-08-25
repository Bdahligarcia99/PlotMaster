import { useState, useMemo, useCallback } from "react";
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
import { useNeuronStore, sortByOrder } from "../../store/neuronStore";
import { buildMirrorTrees } from "../../neuron/mirror";
import type { NeuronMirrorNode } from "../../neuron/mirror/types";
import { mirrorKey } from "../../neuron/mirror/types";
import type { NeuronIconRef } from "../../storage/StorageDriver";
import { IconDisplay } from "../ui/iconPicker/IconPicker";
import ContextMenu from "../ui/ContextMenu";
import IconPicker from "../ui/iconPicker/IconPicker";
import Modal from "../ui/Modal";
import type { NeuronPaneRef } from "./NeuronEditorWorkspace";

interface NeuronEntitiesPanelProps {
  subProjects: Record<string, string>;
  activePaneId: string | null;
  dirtyPaneIds: Set<string>;
  onOpenPane: (pane: NeuronPaneRef) => void;
  onSelectForInspector: (target: import("./NeuronInspector").NeuronSelectionTarget) => void;
}

function resolveIcon(
  icon: NeuronIconRef | undefined,
  fallback?: NeuronIconRef
): NeuronIconRef | undefined {
  return icon ?? fallback;
}

function BinderFolderRow({
  folderId,
  name,
  icon,
  depth,
  isExpanded,
  isActive,
  onToggle,
  onOpen,
  onContextMenu,
  children,
}: {
  folderId: string;
  name: string;
  icon?: NeuronIconRef;
  depth: number;
  isExpanded: boolean;
  isActive: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-folder-${folderId}`,
    data: { type: "folder", folderId },
  });

  return (
    <div ref={setNodeRef}>
      <div
        className={`flex items-center gap-1 rounded px-1 py-1 text-sm cursor-pointer ${
          isOver ? "bg-blue-500/10 ring-1 ring-blue-500/30" : ""
        } ${isActive ? "bg-blue-500/10 text-dark-text" : "text-dark-text hover:bg-dark-accent/30"}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onContextMenu={onContextMenu}
      >
        <button type="button" onClick={onToggle} className="w-4 text-dark-muted shrink-0">
          {children ? (isExpanded ? "▾" : "▸") : " "}
        </button>
        <span className="shrink-0 w-5 flex justify-center">
          <IconDisplay icon={icon} size={14} />
        </span>
        <button type="button" className="flex-1 text-left truncate" onClick={onOpen}>
          {name}
        </button>
      </div>
      {isExpanded && children}
    </div>
  );
}

function BinderFileRow({
  docId,
  name,
  icon,
  depth,
  isActive,
  isDirty,
  onOpen,
  onContextMenu,
}: {
  docId: string;
  name: string;
  icon?: NeuronIconRef;
  depth: number;
  isActive: boolean;
  isDirty: boolean;
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${docId}`,
    data: { type: "user-file", docId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-1 rounded px-1 py-1 text-sm ${
        isDragging ? "opacity-50" : ""
      } ${isActive ? "bg-blue-500/10 ring-1 ring-blue-500/30" : "hover:bg-dark-accent/30"}`}
      style={{ paddingLeft: 20 + depth * 12 }}
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        className="flex-1 flex items-center gap-1 text-left truncate cursor-grab active:cursor-grabbing"
        onClick={onOpen}
        {...listeners}
        {...attributes}
      >
        <span className="shrink-0 w-5 flex justify-center">
          <IconDisplay icon={icon} size={14} />
        </span>
        <span className="truncate">
          {name}
          {isDirty ? " •" : ""}
        </span>
      </button>
    </div>
  );
}

function MirrorTreeRows({
  node,
  depth,
  expanded,
  toggleExpanded,
  activePaneId,
  dirtyPaneIds,
  mirrorMeta,
  onOpenMirror,
  onContextMenu,
  onSelectInspector,
}: {
  node: NeuronMirrorNode;
  depth: number;
  expanded: Set<string>;
  toggleExpanded: (id: string) => void;
  activePaneId: string | null;
  dirtyPaneIds: Set<string>;
  mirrorMeta: Record<string, { icon?: NeuronIconRef }>;
  onOpenMirror: (node: NeuronMirrorNode) => void;
  onContextMenu: (e: React.MouseEvent, node: NeuronMirrorNode) => void;
  onSelectInspector: (target: import("./NeuronInspector").NeuronSelectionTarget) => void;
}) {
  const isExpanded = expanded.has(node.id);
  const paneId = `mirror:${node.moduleSubId}:${node.entityId}`;
  const metaKey = mirrorKey(node.moduleSubId, node.entityId);
  const icon = resolveIcon(mirrorMeta[metaKey]?.icon, node.defaultIcon);

  if (node.kind === "file") {
    return (
      <div
        className={`flex items-center gap-1 rounded px-1 py-1 text-sm cursor-pointer hover:bg-dark-accent/30 ${
          activePaneId === paneId ? "bg-blue-500/10 ring-1 ring-blue-500/30" : ""
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          onOpenMirror(node);
          onSelectInspector({
            kind: "file",
            id: node.name,
            isMirror: true,
            subId: node.moduleSubId,
            entityId: node.entityId,
            registryId: node.registryId,
          });
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <span className="shrink-0 w-5 flex justify-center ml-4">
          <IconDisplay icon={icon} size={14} />
        </span>
        <span className="truncate">
          {node.name}
          {dirtyPaneIds.has(paneId) ? " •" : ""}
        </span>
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded px-1 py-1 text-sm cursor-pointer hover:bg-dark-accent/30"
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          toggleExpanded(node.id);
          onSelectInspector({
            kind: node.kind === "module-root" ? "module-root" : "folder",
            id: node.name,
            isMirror: true,
            subId: node.moduleSubId,
            entityId: node.entityId,
            registryId: node.registryId,
          });
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <button
          type="button"
          className="w-4 text-dark-muted shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded(node.id);
          }}
        >
          {(node.children?.length ?? 0) > 0 ? (isExpanded ? "▾" : "▸") : " "}
        </button>
        <span className="shrink-0 w-5 flex justify-center">
          <IconDisplay icon={icon} size={14} />
        </span>
        <span className="truncate font-medium">{node.name}</span>
      </div>
      {isExpanded &&
        node.children?.map((child) => (
          <MirrorTreeRows
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            toggleExpanded={toggleExpanded}
            activePaneId={activePaneId}
            dirtyPaneIds={dirtyPaneIds}
            mirrorMeta={mirrorMeta}
            onOpenMirror={onOpenMirror}
            onContextMenu={onContextMenu}
            onSelectInspector={onSelectInspector}
          />
        ))}
    </div>
  );
}

export default function NeuronEntitiesPanel({
  subProjects,
  activePaneId,
  dirtyPaneIds,
  onOpenPane,
  onSelectForInspector,
}: NeuronEntitiesPanelProps) {
  const folders = useNeuronStore((s) => s.folders);
  const documents = useNeuronStore((s) => s.documents);
  const mirrors = useNeuronStore((s) => s.mirrors);
  const mirrorMeta = useNeuronStore((s) => s.mirrorMeta);
  const activeFolderId = useNeuronStore((s) => s.activeFolderId);
  const createFolder = useNeuronStore((s) => s.createFolder);
  const createDocument = useNeuronStore((s) => s.createDocument);
  const moveDocument = useNeuronStore((s) => s.moveDocument);
  const setFolderIcon = useNeuronStore((s) => s.setFolderIcon);
  const setDocumentIcon = useNeuronStore((s) => s.setDocumentIcon);
  const setMirrorMeta = useNeuronStore((s) => s.setMirrorMeta);
  const setActiveFolderId = useNeuronStore((s) => s.setActiveFolderId);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [expandedMirror, setExpandedMirror] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target:
      | { type: "user-folder"; id: string }
      | { type: "user-doc"; id: string }
      | { type: "mirror"; node: NeuronMirrorNode };
  } | null>(null);
  const [iconPickerTarget, setIconPickerTarget] = useState<
    | { type: "user-folder"; id: string }
    | { type: "user-doc"; id: string }
    | { type: "mirror"; node: NeuronMirrorNode }
    | null
  >(null);
  const [dragDocId, setDragDocId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const mirrorTrees = useMemo(
    () => buildMirrorTrees(subProjects, mirrors),
    [subProjects, mirrors]
  );

  const rootFolders = useMemo(
    () => sortByOrder(folders.filter((f) => f.parentId === null)),
    [folders]
  );

  const toggleBinderFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMirrorFolder = (id: string) => {
    setExpandedMirror((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderBinderSubtree = (parentId: string | null, depth: number) => {
    const childFolders = sortByOrder(folders.filter((f) => f.parentId === parentId));
    const childDocs = sortByOrder(documents.filter((d) => d.folderId === parentId));

    return (
      <>
        {childFolders.map((folder) => {
          const expanded = expandedFolders.has(folder.id);
          const hasChildren =
            folders.some((f) => f.parentId === folder.id) ||
            documents.some((d) => d.folderId === folder.id);
          return (
            <BinderFolderRow
              key={folder.id}
              folderId={folder.id}
              name={folder.name}
              icon={folder.icon}
              depth={depth}
              isExpanded={expanded}
              isActive={activeFolderId === folder.id}
              onToggle={() => toggleBinderFolder(folder.id)}
              onOpen={() => {
                setActiveFolderId(folder.id);
                onSelectForInspector({ kind: "folder", id: folder.id, isMirror: false });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, target: { type: "user-folder", id: folder.id } });
              }}
            >
              {hasChildren && expanded ? renderBinderSubtree(folder.id, depth + 1) : null}
            </BinderFolderRow>
          );
        })}
        {childDocs.map((doc) => (
          <BinderFileRow
            key={doc.id}
            docId={doc.id}
            name={doc.name}
            icon={doc.icon}
            depth={depth}
            isActive={activePaneId === `user:${doc.id}`}
            isDirty={dirtyPaneIds.has(`user:${doc.id}`)}
            onOpen={() => {
              onOpenPane({ kind: "user", docId: doc.id });
              onSelectForInspector({ kind: "document", id: doc.id, isMirror: false });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, target: { type: "user-doc", id: doc.id } });
            }}
          />
        ))}
      </>
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragDocId(null);
    const { active, over } = event;
    if (!over) return;
    const docId = active.data.current?.docId as string | undefined;
    const folderId = over.data.current?.folderId as string | undefined;
    if (docId && folderId) moveDocument(docId, folderId);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const docId = event.active.data.current?.docId as string | undefined;
    if (docId) setDragDocId(docId);
  };

  const openIconPicker = useCallback(() => {
    if (!contextMenu) return;
    setIconPickerTarget(contextMenu.target);
    setContextMenu(null);
  }, [contextMenu]);

  const applyIcon = (icon: NeuronIconRef | undefined) => {
    if (!iconPickerTarget) return;
    if (iconPickerTarget.type === "user-folder") {
      setFolderIcon(iconPickerTarget.id, icon);
    } else if (iconPickerTarget.type === "user-doc") {
      setDocumentIcon(iconPickerTarget.id, icon);
    } else if (iconPickerTarget.type === "mirror") {
      const key = mirrorKey(iconPickerTarget.node.moduleSubId, iconPickerTarget.node.entityId);
      setMirrorMeta(key, { icon });
    }
    setIconPickerTarget(null);
  };

  const currentIcon = useMemo(() => {
    if (!iconPickerTarget) return undefined;
    if (iconPickerTarget.type === "user-folder") {
      return folders.find((f) => f.id === iconPickerTarget.id)?.icon;
    }
    if (iconPickerTarget.type === "user-doc") {
      return documents.find((d) => d.id === iconPickerTarget.id)?.icon;
    }
    if (iconPickerTarget.type === "mirror") {
      const key = mirrorKey(iconPickerTarget.node.moduleSubId, iconPickerTarget.node.entityId);
      return mirrorMeta[key]?.icon ?? iconPickerTarget.node.defaultIcon;
    }
    return undefined;
  }, [iconPickerTarget, folders, documents, mirrorMeta]);

  return (
    <div className="flex flex-col h-full bg-dark-surface border-r border-dark-accent">
      <div className="px-3 py-2 border-b border-dark-accent">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-dark-muted">Sub Entities</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase text-dark-muted">Binder</span>
            <div className="flex gap-1">
              <button
                type="button"
                className="text-[10px] px-2 py-0.5 rounded border border-dark-accent text-dark-muted hover:text-dark-text"
                onClick={() => createDocument()}
              >
                + File
              </button>
              <button
                type="button"
                className="text-[10px] px-2 py-0.5 rounded border border-dark-accent text-dark-muted hover:text-dark-text"
                onClick={() => createFolder("New Folder", activeFolderId)}
              >
                + Folder
              </button>
            </div>
          </div>
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {rootFolders.length === 0 && documents.filter((d) => !d.folderId).length === 0 ? (
              <p className="text-xs text-dark-muted px-2">No files yet.</p>
            ) : (
              renderBinderSubtree(null, 0)
            )}
            <DragOverlay>
              {dragDocId ? (
                <div className="px-2 py-1 text-sm bg-dark-surface border border-dark-accent rounded shadow-lg">
                  {documents.find((d) => d.id === dragDocId)?.name}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </section>

        {mirrorTrees.length > 0 && (
          <section>
            <div className="text-[10px] uppercase text-dark-muted mb-2">Modules</div>
            {mirrorTrees.map((tree) => (
              <MirrorTreeRows
                key={tree.id}
                node={tree}
                depth={0}
                expanded={expandedMirror}
                toggleExpanded={toggleMirrorFolder}
                activePaneId={activePaneId}
                dirtyPaneIds={dirtyPaneIds}
                mirrorMeta={mirrorMeta}
                onOpenMirror={(node) => {
                  if (node.kind !== "file") return;
                  onOpenPane({
                    kind: "mirror",
                    subId: node.moduleSubId,
                    registryId: node.registryId,
                    entityId: node.entityId,
                    name: node.name,
                  });
                }}
                onContextMenu={(e, node) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, target: { type: "mirror", node } });
                }}
                onSelectInspector={(target) => onSelectForInspector(target)}
              />
            ))}
          </section>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[{ id: "icons", label: "Icons", onClick: openIconPicker }]}
          onClose={() => setContextMenu(null)}
        />
      )}

      <Modal
        isOpen={!!iconPickerTarget}
        onClose={() => setIconPickerTarget(null)}
        title="Icons"
        contentClassName="max-w-md"
      >
        <IconPicker
          value={currentIcon}
          onSelect={(icon) => applyIcon(icon)}
          onClear={() => applyIcon(undefined)}
        />
      </Modal>
    </div>
  );
}
