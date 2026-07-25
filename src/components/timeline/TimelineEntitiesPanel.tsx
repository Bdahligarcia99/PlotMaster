import { useMemo, useState } from "react";
import { isSelected, useTimelineStore } from "../../store/timelineStore";
import type { TimelineSelectionItem } from "../../store/timelineTypes";

interface TimelineEntitiesPanelProps {
  onSelectForEdit?: () => void;
  /** Text Editor workspace — Derived / User-made files list. */
  textEditorMode?: boolean;
  openFileIds?: string[];
  activeFileId?: string | null;
  dirtyDocIds?: Set<string>;
  onOpenFile?: (docId: string) => void;
  onNewUserFile?: () => void;
  onDeleteUserFile?: (docId: string) => void;
}

export default function TimelineEntitiesPanel({
  onSelectForEdit,
  textEditorMode = false,
  openFileIds = [],
  activeFileId = null,
  dirtyDocIds = new Set(),
  onOpenFile,
  onNewUserFile,
  onDeleteUserFile,
}: TimelineEntitiesPanelProps) {
  const lanes = useTimelineStore((s) => s.lanes);
  const beats = useTimelineStore((s) => s.beats);
  const connections = useTimelineStore((s) => s.connections);
  const documents = useTimelineStore((s) => s.documents);
  const deleteDocument = useTimelineStore((s) => s.deleteDocument);
  const selection = useTimelineStore((s) => s.selection);
  const toggleSelection = useTimelineStore((s) => s.toggleSelection);
  const selectOnly = useTimelineStore((s) => s.selectOnly);
  const [search, setSearch] = useState("");
  const [expandedLanes, setExpandedLanes] = useState<Record<string, boolean>>({});
  const [connectionsExpanded, setConnectionsExpanded] = useState(true);

  const sortedLanes = useMemo(
    () => [...lanes].sort((a, b) => a.sortOrder - b.sortOrder),
    [lanes]
  );

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

  const isExpanded = (laneId: string) => expandedLanes[laneId] !== false;

  const allCollapsed =
    sortedLanes.length > 0 && sortedLanes.every((lane) => !isExpanded(lane.id));

  const toggleAllLanes = () => {
    const nextExpanded = allCollapsed;
    setExpandedLanes(Object.fromEntries(sortedLanes.map((lane) => [lane.id, nextExpanded])));
  };

  const derivedDocs = useMemo(
    () =>
      documents
        .filter((d) => d.kind === "derived")
        .sort((a, b) => {
          const la = lanes.find((l) => l.id === a.laneId)?.sortOrder ?? 0;
          const lb = lanes.find((l) => l.id === b.laneId)?.sortOrder ?? 0;
          return la - lb;
        }),
    [documents, lanes]
  );

  const userDocs = useMemo(
    () =>
      documents
        .filter((d) => d.kind !== "derived")
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [documents]
  );

  if (textEditorMode) {
    return (
      <div className="w-full flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden h-full">
        <div className="p-4 border-b border-dark-accent/50">
          <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
            Entities
          </h2>
          <p className="text-dark-muted text-xs mt-1">Files</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          <div>
            <p className="text-xs text-dark-muted uppercase tracking-wide px-1 mb-1">Derived</p>
            {derivedDocs.length === 0 ? (
              <p className="text-dark-muted text-xs py-2 px-2">
                No lanes yet. Create a lane in Outline mode, or convert a user-made file.
              </p>
            ) : (
              <div className="space-y-1">
                {derivedDocs.map((doc) => {
                  const isActive = activeFileId === doc.id;
                  const isOpen = openFileIds.includes(doc.id);
                  const dirty = dirtyDocIds.has(doc.id);
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => onOpenFile?.(doc.id)}
                      className={`w-full text-left px-3 py-2 text-sm rounded border truncate ${
                        isActive
                          ? "border-blue-500/50 bg-blue-500/10 text-dark-text ring-1 ring-blue-500/50"
                          : isOpen
                            ? "border-dark-accent/50 text-dark-text hover:bg-dark-accent/30"
                            : "border-dark-accent/30 text-dark-text hover:bg-dark-accent/30"
                      }`}
                    >
                      {doc.name}
                      {dirty ? " •" : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between px-1 mb-1">
              <p className="text-xs text-dark-muted uppercase tracking-wide">User-made</p>
              <button
                type="button"
                onClick={() => onNewUserFile?.()}
                className="text-[11px] text-blue-300 hover:text-blue-200"
              >
                + New
              </button>
            </div>
            {userDocs.length === 0 ? (
              <p className="text-dark-muted text-xs py-2 px-2">
                No user-made files. Create one to draft beats, then Convert to Lane.
              </p>
            ) : (
              <div className="space-y-1">
                {userDocs.map((doc) => {
                  const isActive = activeFileId === doc.id;
                  const isOpen = openFileIds.includes(doc.id);
                  const dirty = dirtyDocIds.has(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className={`flex items-center gap-1 rounded border overflow-hidden ${
                        isActive
                          ? "border-blue-500/50 ring-1 ring-blue-500/50"
                          : isOpen
                            ? "border-dark-accent/50"
                            : "border-dark-accent/30"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenFile?.(doc.id)}
                        className={`flex-1 text-left px-3 py-2 text-sm truncate ${
                          isActive
                            ? "bg-blue-500/10 text-dark-text"
                            : isOpen
                              ? "text-dark-text hover:bg-dark-accent/30"
                              : "text-dark-text hover:bg-dark-accent/30"
                        }`}
                      >
                        {doc.name}
                        {dirty ? " •" : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (dirty) {
                            const ok = window.confirm(
                              `"${doc.name}" has unsaved changes. Delete anyway?`
                            );
                            if (!ok) return;
                          }
                          onDeleteUserFile?.(doc.id);
                          deleteDocument(doc.id);
                        }}
                        className="px-2 py-2 text-xs text-red-400 hover:text-red-300"
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden h-full">
      <div className="p-4 border-b border-dark-accent/50">
        <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
          Entities
        </h2>
        <p className="text-dark-muted text-xs mt-1">Lanes → Beats</p>
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
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredLanes.length === 0 ? (
          <p className="text-dark-muted text-sm py-4 text-center">No lanes yet. Use Lane in the toolbar.</p>
        ) : (
          <div className="space-y-1">
            {filteredLanes.map((lane) => {
              const laneBeats = beats
                .filter((b) => b.laneId === lane.id)
                .sort((a, b) => a.slot - b.slot);
              const laneItem: TimelineSelectionItem = { type: "lane", id: lane.id };
              const laneSelected = isSelected(selection, laneItem);
              const expanded = isExpanded(lane.id);

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
                  const selected = isSelected(selection, item);
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
