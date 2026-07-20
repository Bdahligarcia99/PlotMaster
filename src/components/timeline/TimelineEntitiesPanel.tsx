import { useMemo, useState } from "react";
import { isSelected, useTimelineStore } from "../../store/timelineStore";
import type { TimelineSelectionItem } from "../../store/timelineTypes";

interface TimelineEntitiesPanelProps {
  onSelectForEdit?: () => void;
}

export default function TimelineEntitiesPanel({ onSelectForEdit }: TimelineEntitiesPanelProps) {
  const lanes = useTimelineStore((s) => s.lanes);
  const beats = useTimelineStore((s) => s.beats);
  const connections = useTimelineStore((s) => s.connections);
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
          (b.title.toLowerCase().includes(q) || b.description.toLowerCase().includes(q))
      );
    });
  }, [sortedLanes, beats, search]);

  const handleClick = (item: TimelineSelectionItem, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      toggleSelection(item);
    } else {
      selectOnly(item);
    }
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
                .sort((a, b) => a.order - b.order);
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
                              className={`w-full text-left px-4 py-1.5 text-sm truncate hover:bg-dark-accent/20 ${
                                beatSelected ? "bg-blue-500/15 text-dark-text" : "text-dark-muted"
                              }`}
                            >
                              {beat.title || "Beat"}
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
                  const beatA = beatsById.get(connection.beatIdA);
                  const beatB = beatsById.get(connection.beatIdB);
                  return (
                    <button
                      key={connection.id}
                      type="button"
                      onClick={(e) => handleClick(item, e)}
                      className={`w-full text-left px-4 py-1.5 text-sm truncate hover:bg-dark-accent/20 ${
                        selected ? "bg-amber-500/15 text-dark-text" : "text-dark-muted"
                      }`}
                    >
                      {(beatA?.title || "Beat")} ↔ {(beatB?.title || "Beat")}
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
