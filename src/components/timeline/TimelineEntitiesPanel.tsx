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
import { getFullySelectedConnectionIds, isSelected, useTimelineStore } from "../../store/timelineStore";
import {
  filterBeatsByScope,
  filterConnectionsForActiveFolder,
  filterLanesByScope,
  getScopedLaneIds,
} from "../../store/timelineFolderHelpers";
import type { TimelineSelectionItem } from "../../store/timelineTypes";

interface TimelineEntitiesPanelProps {
  onSelectForEdit?: () => void;
  textEditorMode?: boolean;
  openFileIds?: string[];
  activeFileId?: string | null;
  dirtyDocIds?: Set<string>;
  selectedFileIds?: Set<string>;
  onToggleFileSelect?: (docId: string) => void;
  onOpenFile?: (docId: string) => void;
  onNewUserFile?: () => void;
  onRequestNewFolder?: (selectedDocIds: string[]) => void;
  onDeleteUserFile?: (docId: string) => void;
  onRequestFolderDelete?: (folderId: string, folderName: string) => void;
  onRequestMoveFiles?: (docIds: string[], targetFolderId: string) => void;
  onRenameFolder?: (folderId: string, name: string) => void;
}

function DraggableFileRow({
  docId,
  name,
  isActive,
  isOpen,
  dirty,
  selected,
  onOpen,
  onDelete,
  onToggleSelect,
}: {
  docId: string;
  name: string;
  isActive: boolean;
  isOpen: boolean;
  dirty: boolean;
  selected: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onToggleSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${docId}`,
    data: { type: "file", docId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-1 rounded border overflow-hidden ${
        isDragging ? "opacity-50" : ""
      } ${
        isActive
          ? "border-blue-500/50 ring-1 ring-blue-500/50"
          : isOpen
            ? "border-dark-accent/50"
            : "border-dark-accent/30"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className="themed-checkbox ml-2 shrink-0"
        aria-label={`Select ${name}`}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        {...listeners}
        {...attributes}
        onClick={onOpen}
        className={`flex-1 text-left px-2 py-2 text-sm truncate cursor-grab active:cursor-grabbing ${
          isActive
            ? "bg-blue-500/10 text-dark-text"
            : "text-dark-text hover:bg-dark-accent/30"
        }`}
      >
        {name}
        {dirty ? " •" : ""}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="px-2 py-2 text-xs text-red-400 hover:text-red-300"
        title="Delete"
      >
        ×
      </button>
    </div>
  );
}

function FolderDropTarget({
  folderId,
  name,
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
  children,
}: {
  folderId: string;
  name: string;
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
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${folderId}`,
    data: { type: "folder", folderId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border overflow-hidden ${
        isOver ? "border-blue-500/60 ring-1 ring-blue-500/40" : "border-dark-accent/30"
      }`}
    >
      <div
        className={`flex items-center gap-1 px-2 py-1.5 ${
          isActive ? "bg-blue-500/15" : "bg-dark-accent/20 hover:bg-dark-accent/30"
        }`}
      >
        <button
          type="button"
          onClick={onToggleExpand}
          className="p-0.5 text-dark-muted hover:text-dark-text shrink-0"
          aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
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
            className="flex-1 min-w-0 px-1 py-0.5 text-sm bg-dark-bg border border-blue-500/50 rounded text-dark-text"
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
            className="flex-1 text-left text-sm font-medium text-dark-text truncate min-w-0"
          >
            {name}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="px-1.5 text-xs text-red-400 hover:text-red-300 shrink-0"
          title="Delete folder"
        >
          ×
        </button>
      </div>
      {isExpanded && <div className="p-1.5 space-y-1">{children}</div>}
    </div>
  );
}

export default function TimelineEntitiesPanel({
  onSelectForEdit,
  textEditorMode = false,
  openFileIds = [],
  activeFileId = null,
  dirtyDocIds = new Set(),
  selectedFileIds = new Set(),
  onToggleFileSelect,
  onOpenFile,
  onNewUserFile,
  onRequestNewFolder,
  onDeleteUserFile,
  onRequestFolderDelete,
  onRequestMoveFiles,
  onRenameFolder,
}: TimelineEntitiesPanelProps) {
  const allLanes = useTimelineStore((s) => s.lanes);
  const allBeats = useTimelineStore((s) => s.beats);
  const allConnections = useTimelineStore((s) => s.connections);
  const documents = useTimelineStore((s) => s.documents);
  const folders = useTimelineStore((s) => s.folders);
  const activeFolderId = useTimelineStore((s) => s.activeFolderId);
  const setActiveFolderId = useTimelineStore((s) => s.setActiveFolderId);
  const renameFolder = useTimelineStore((s) => s.renameFolder);
  const selection = useTimelineStore((s) => s.selection);
  const toggleSelection = useTimelineStore((s) => s.toggleSelection);
  const selectOnly = useTimelineStore((s) => s.selectOnly);

  const [search, setSearch] = useState("");
  const [expandedLanes, setExpandedLanes] = useState<Record<string, boolean>>({});
  const [connectionsExpanded, setConnectionsExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const scopedLaneIds = useMemo(
    () => getScopedLaneIds(documents, folders, activeFolderId),
    [documents, folders, activeFolderId]
  );

  const lanes = useMemo(
    () => filterLanesByScope(allLanes, scopedLaneIds),
    [allLanes, scopedLaneIds]
  );
  const beats = useMemo(
    () => filterBeatsByScope(allBeats, scopedLaneIds),
    [allBeats, scopedLaneIds]
  );
  const connections = useMemo(
    () => filterConnectionsForActiveFolder(allConnections, allBeats, scopedLaneIds),
    [allConnections, allBeats, scopedLaneIds]
  );
  const fullySelectedConnectionIds = useMemo(
    () => getFullySelectedConnectionIds(allConnections, selection),
    [allConnections, selection]
  );

  const sortedLanes = useMemo(
    () => [...lanes].sort((a, b) => a.sortOrder - b.sortOrder),
    [lanes]
  );

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.sortOrder - b.sortOrder),
    [folders]
  );

  const docsByFolder = useMemo(() => {
    const map = new Map<string, typeof documents>();
    for (const folder of sortedFolders) {
      map.set(
        folder.id,
        documents
          .filter((d) => d.folderId === folder.id)
          .sort((a, b) => b.updatedAt - a.updatedAt)
      );
    }
    return map;
  }, [documents, sortedFolders]);

  const beatsById = useMemo(() => new Map(beats.map((b) => [b.id, b])), [beats]);

  const filteredLanes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedLanes;
    return sortedLanes.filter((lane) => {
      if (lane.label.toLowerCase().includes(q)) return true;
      return beats.some(
        (b) =>
          b.laneId === lane.id &&
          (b.title.toLowerCase().includes(q) ||
            b.synopsis.toLowerCase().includes(q) ||
            b.detail.toLowerCase().includes(q))
      );
    });
  }, [sortedLanes, beats, search]);

  const handleClick = (item: TimelineSelectionItem, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      toggleSelection(item);
    } else {
      selectOnly(item);
    }
  };

  const handleDoubleClick = (item: TimelineSelectionItem, e: React.MouseEvent) => {
    e.stopPropagation();
    selectOnly(item);
    onSelectForEdit?.();
  };

  const toggleLane = (laneId: string) => {
    setExpandedLanes((prev) => ({ ...prev, [laneId]: prev[laneId] === false }));
  };

  const isLaneExpanded = (laneId: string) => expandedLanes[laneId] !== false;

  const allCollapsed =
    sortedLanes.length > 0 &&
    sortedLanes.every((lane) => !isLaneExpanded(lane.id)) &&
    (connections.length === 0 || !connectionsExpanded);

  const toggleAllLanes = () => {
    const nextExpanded = allCollapsed;
    setExpandedLanes(Object.fromEntries(sortedLanes.map((lane) => [lane.id, nextExpanded])));
    if (connections.length > 0) {
      setConnectionsExpanded(nextExpanded);
    }
  };

  const isFolderExpanded = (folderId: string) => expandedFolders[folderId] !== false;

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: prev[folderId] === false }));
  };

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

    const docIds =
      selectedFileIds.has(docId) && selectedFileIds.size > 0
        ? [...selectedFileIds]
        : [docId];
    onRequestMoveFiles?.(docIds, targetFolderId);
  };

  const handleNewFolderClick = () => {
    onRequestNewFolder?.([...selectedFileIds]);
  };

  if (textEditorMode) {
    return (
      <div className="w-full flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden h-full">
        <div className="p-4 border-b border-dark-accent/50">
          <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
            Sub Entities
          </h2>
          <p className="text-dark-muted text-xs mt-1">Folders → Files</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex items-center justify-end gap-2 px-1 mb-2">
            <button
              type="button"
              onClick={() => onNewUserFile?.()}
              className="text-[11px] text-blue-300 hover:text-blue-200 px-1.5 py-0.5"
              title="New text file in active folder"
            >
              + File
            </button>
            <button
              type="button"
              onClick={handleNewFolderClick}
              className="text-[11px] text-blue-300 hover:text-blue-200 px-1.5 py-0.5"
              title="New folder (moves selected files if any are checked)"
            >
              + Folder
            </button>
          </div>
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {sortedFolders.length === 0 ? (
              <p className="text-dark-muted text-xs py-2 px-2">
                No folders yet. Switch to Text mode to auto-create one, or click + Folder.
              </p>
            ) : (
              <div className="space-y-2">
                {sortedFolders.map((folder) => {
                  const folderDocs = docsByFolder.get(folder.id) ?? [];
                  const isActive = activeFolderId === folder.id;
                  return (
                    <FolderDropTarget
                      key={folder.id}
                      folderId={folder.id}
                      name={folder.name}
                      isActive={isActive}
                      isExpanded={isFolderExpanded(folder.id)}
                      isRenaming={renamingFolderId === folder.id}
                      renameValue={renameValue}
                      onRenameChange={setRenameValue}
                      onRenameCommit={() => {
                        if (renamingFolderId) {
                          onRenameFolder?.(renamingFolderId, renameValue);
                        }
                        setRenamingFolderId(null);
                      }}
                      onRenameCancel={() => setRenamingFolderId(null)}
                      onSelect={() => setActiveFolderId(folder.id)}
                      onToggleExpand={() => toggleFolder(folder.id)}
                      onStartRename={() => {
                        setRenamingFolderId(folder.id);
                        setRenameValue(folder.name);
                      }}
                      onDelete={() => onRequestFolderDelete?.(folder.id, folder.name)}
                    >
                      {folderDocs.length === 0 ? (
                        <p className="text-dark-muted text-[10px] px-2 py-1">No files</p>
                      ) : (
                        folderDocs.map((doc) => (
                          <DraggableFileRow
                            key={doc.id}
                            docId={doc.id}
                            name={doc.name}
                            isActive={activeFileId === doc.id}
                            isOpen={openFileIds.includes(doc.id)}
                            dirty={dirtyDocIds.has(doc.id)}
                            selected={selectedFileIds.has(doc.id)}
                            onOpen={() => onOpenFile?.(doc.id)}
                            onDelete={() => onDeleteUserFile?.(doc.id)}
                            onToggleSelect={() => onToggleFileSelect?.(doc.id)}
                          />
                        ))
                      )}
                    </FolderDropTarget>
                  );
                })}
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

  return (
    <div className="w-full flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden h-full">
      <div className="p-4 border-b border-dark-accent/50">
        <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
          Sub Entities
        </h2>
        <p className="text-dark-muted text-xs mt-1">Folders → Lanes → Beats</p>
      </div>
      <div className="p-3 border-b border-dark-accent/50 space-y-2">
        {sortedLanes.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={toggleAllLanes}
              className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded hover:bg-dark-accent/30"
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          </div>
        )}
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm placeholder-dark-muted focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="px-3 py-2 border-b border-dark-accent/50 min-w-0 flex items-center gap-1">
        <div
          role="tablist"
          aria-label="Outline folders"
          className="flex-1 min-w-0 overflow-x-auto flex gap-1 pb-0.5"
        >
          {sortedFolders.map((folder) => {
              const isActive = activeFolderId === folder.id;
              const isRenaming = renamingFolderId === folder.id;
              if (isRenaming) {
                return (
                  <input
                    key={folder.id}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      renameFolder(folder.id, renameValue);
                      setRenamingFolderId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        renameFolder(folder.id, renameValue);
                        setRenamingFolderId(null);
                      }
                      if (e.key === "Escape") setRenamingFolderId(null);
                    }}
                    className="flex-shrink-0 px-2 py-1 rounded-md text-xs bg-dark-bg border border-blue-500/50 text-dark-text min-w-[80px] max-w-[140px]"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                );
              }
              return (
                <button
                  key={folder.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveFolderId(folder.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenamingFolderId(folder.id);
                    setRenameValue(folder.name);
                  }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors max-w-[140px] truncate ${
                    isActive
                      ? "bg-dark-accent text-dark-text"
                      : "text-dark-muted hover:text-dark-text hover:bg-dark-accent/40"
                  }`}
                  title={folder.name}
                >
                  {folder.name}
                </button>
              );
            })}
        </div>
        <button
          type="button"
          onClick={() => onRequestNewFolder?.([])}
          className="flex-shrink-0 px-2 py-1 rounded-md text-xs text-blue-300 hover:text-blue-200 hover:bg-dark-accent/40"
          title="New folder"
        >
          + Folder
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredLanes.length === 0 ? (
          <p className="text-dark-muted text-sm py-4 text-center">
            {sortedFolders.length > 0
              ? "No lanes in this folder. Use Lane in the toolbar or add lanes in Text mode."
              : "No lanes yet. Use Lane in the toolbar."}
          </p>
        ) : (
          <div className="space-y-1">
            {filteredLanes.map((lane) => {
              const laneBeats = beats
                .filter((b) => b.laneId === lane.id)
                .sort((a, b) => a.slot - b.slot);
              const laneItem: TimelineSelectionItem = { type: "lane", id: lane.id };
              const laneSelected = isSelected(selection, laneItem);
              const expanded = isLaneExpanded(lane.id);

              return (
                <div key={lane.id} className="rounded-xl border border-dark-accent/30 overflow-hidden">
                  <div
                    className={`flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-dark-accent/30 ${
                      laneSelected ? "bg-blue-500/20 ring-1 ring-blue-500/50" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLane(lane.id);
                      }}
                      className="p-0.5 text-dark-muted hover:text-dark-text"
                      aria-label={expanded ? "Collapse lane" : "Expand lane"}
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="flex-1 text-left min-w-0"
                      onClick={(e) => handleClick(laneItem, e)}
                      onDoubleClick={(e) => handleDoubleClick(laneItem, e)}
                    >
                      <span className="text-dark-text text-sm font-medium truncate block">{lane.label}</span>
                      <span className="text-dark-muted text-[10px] uppercase">{lane.laneType}</span>
                    </button>
                  </div>
                  {expanded && (
                    <div className="border-t border-dark-accent/20 py-1">
                      {laneBeats.length === 0 ? (
                        <p className="text-dark-muted text-xs px-4 py-2">No beats</p>
                      ) : (
                        laneBeats.map((beat) => {
                          const beatItem: TimelineSelectionItem = { type: "beat", id: beat.id };
                          const beatSelected = isSelected(selection, beatItem);
                          return (
                            <button
                              key={beat.id}
                              type="button"
                              onClick={(e) => handleClick(beatItem, e)}
                              onDoubleClick={(e) => handleDoubleClick(beatItem, e)}
                              className={`w-full text-left px-4 py-1.5 text-sm truncate hover:bg-dark-accent/20 ${
                                beatSelected
                                  ? "bg-blue-500/15 text-dark-text"
                                  : beat.kind === "anchor"
                                    ? "text-violet-300/90 hover:bg-violet-500/10"
                                    : "text-dark-muted"
                              }`}
                            >
                              {beat.kind === "anchor" ? (
                                <>
                                  <span className="text-[10px] opacity-80">⚓ </span>
                                  {beat.title || "Anchor"}
                                </>
                              ) : (
                                beat.title || "Beat"
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {connections.length > 0 && (
          <div className="rounded-xl border border-dark-accent/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setConnectionsExpanded((v) => !v)}
              className="w-full flex items-center gap-2 px-2 py-2 hover:bg-dark-accent/30 text-left"
            >
              <svg
                className={`w-4 h-4 text-dark-muted transition-transform ${connectionsExpanded ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-dark-text text-sm font-medium">Crossings</span>
              <span className="text-dark-muted text-[10px]">({connections.length})</span>
            </button>
            {connectionsExpanded && (
              <div className="border-t border-dark-accent/20 py-1">
                {connections.map((connection) => {
                  const item: TimelineSelectionItem = { type: "connection", id: connection.id };
                  const selected =
                    isSelected(selection, item) || fullySelectedConnectionIds.has(connection.id);
                  const beatLabels = connection.beatIds.map((beatId) => {
                    const beat = beatsById.get(beatId);
                    return beat?.title || "Beat";
                  });
                  return (
                    <button
                      key={connection.id}
                      type="button"
                      onClick={(e) => handleClick(item, e)}
                      onDoubleClick={(e) => handleDoubleClick(item, e)}
                      className={`w-full text-left px-4 py-1.5 text-sm truncate hover:bg-dark-accent/20 ${
                        selected ? "bg-amber-500/15 text-dark-text" : "text-dark-muted"
                      }`}
                    >
                      {beatLabels.join(" ↔ ")}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
