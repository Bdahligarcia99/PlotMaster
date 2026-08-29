import { useEffect, useMemo, useRef, useState } from "react";
import {
  LOG_DISPLAY_BATCH,
  getFilteredEvents,
  useActionLogStore,
  type LogCategory,
} from "../../logging/actionLog";
import { formatLogLine, LOG_CATEGORY_LABELS } from "../../logging/formatLog";

const ALL_CATEGORIES: LogCategory[] = [
  "node",
  "union",
  "person",
  "selection",
  "document",
  "family",
  "layout",
  "ui",
  "navigation",
  "persistence",
  "error",
];

export default function LogFeedView() {
  const events = useActionLogStore((s) => s.events);
  const paused = useActionLogStore((s) => s.paused);
  const verbose = useActionLogStore((s) => s.verbose);
  const categoryFilter = useActionLogStore((s) => s.categoryFilter);
  const searchQuery = useActionLogStore((s) => s.searchQuery);
  const setPaused = useActionLogStore((s) => s.setPaused);
  const setVerbose = useActionLogStore((s) => s.setVerbose);
  const setCategoryFilter = useActionLogStore((s) => s.setCategoryFilter);
  const setSearchQuery = useActionLogStore((s) => s.setSearchQuery);
  const clear = useActionLogStore((s) => s.clear);

  const [displayCount, setDisplayCount] = useState(LOG_DISPLAY_BATCH);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  const filtered = useMemo(
    () =>
      getFilteredEvents(events, {
        verbose,
        categoryFilter,
        searchQuery,
      }),
    [events, verbose, categoryFilter, searchQuery]
  );

  const visible = useMemo(() => {
    if (filtered.length <= displayCount) return filtered;
    return filtered.slice(filtered.length - displayCount);
  }, [filtered, displayCount]);

  const canLoadOlder = filtered.length > visible.length;

  useEffect(() => {
    if (!autoScroll || paused || userScrolledRef.current) return;
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visible.length, autoScroll, paused]);

  const handleScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    userScrolledRef.current = !atBottom;
    if (atBottom) userScrolledRef.current = false;
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-dark-surface">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-dark-accent/40 shrink-0">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search log…"
          className="flex-1 min-w-[120px] text-xs px-2 py-1 rounded border border-dark-accent/50 bg-dark-bg text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-blue-500/60"
        />
        <label className="flex items-center gap-1 text-xs text-dark-muted cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={verbose}
            onChange={(e) => setVerbose(e.target.checked)}
            className="themed-checkbox"
          />
          Verbose
        </label>
        <label className="flex items-center gap-1 text-xs text-dark-muted cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="themed-checkbox"
          />
          Auto-scroll
        </label>
        <button
          type="button"
          onClick={() => setPaused(!paused)}
          className={`text-xs px-2 py-1 rounded border ${
            paused
              ? "border-amber-500/50 text-amber-400"
              : "border-dark-accent/50 text-dark-muted hover:text-dark-text"
          }`}
        >
          {paused ? "Paused" : "Pause"}
        </button>
        <button
          type="button"
          onClick={() => clear()}
          className="text-xs text-dark-muted hover:text-red-400 px-2 py-1 rounded border border-dark-accent/50"
        >
          Clear
        </button>
        <span className="text-xs text-dark-muted whitespace-nowrap">
          {filtered.length} / {events.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b border-dark-accent/30 shrink-0">
        <button
          type="button"
          onClick={() => setCategoryFilter(null)}
          className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${
            categoryFilter == null
              ? "bg-dark-accent text-dark-text"
              : "text-dark-muted hover:bg-dark-accent/40"
          }`}
        >
          All
        </button>
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
            className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${
              categoryFilter === cat
                ? "bg-dark-accent text-dark-text"
                : "text-dark-muted hover:bg-dark-accent/40"
            }`}
          >
            {LOG_CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {canLoadOlder && (
        <div className="px-3 py-1 shrink-0 border-b border-dark-accent/20">
          <button
            type="button"
            onClick={() => setDisplayCount((c) => c + LOG_DISPLAY_BATCH)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Load older ({filtered.length - visible.length} hidden)
          </button>
        </div>
      )}

      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-auto font-mono text-[11px] leading-relaxed"
      >
        {visible.length === 0 ? (
          <div className="flex items-center justify-center h-full text-dark-muted text-sm px-4 text-center">
            {events.length === 0
              ? "No events yet. Actions will appear here as you use the app."
              : "No events match the current filters."}
          </div>
        ) : (
          <ul className="divide-y divide-dark-accent/20">
            {visible.map((event, i) => {
              const prev = i > 0 ? visible[i - 1] : undefined;
              const expanded = expandedSeq === event.seq;
              const tierClass =
                event.tier === "error"
                  ? "text-red-400"
                  : event.tier === "action"
                    ? "text-dark-text"
                    : "text-dark-muted";
              return (
                <li key={event.seq} className="px-3 py-1.5 hover:bg-dark-accent/20">
                  <button
                    type="button"
                    className={`w-full text-left ${tierClass}`}
                    onClick={() => setExpandedSeq(expanded ? null : event.seq)}
                  >
                    <span className="whitespace-pre-wrap break-all">
                      {formatLogLine(event, prev?.t)}
                    </span>
                  </button>
                  {expanded && event.payload !== undefined && (
                    <pre className="mt-1 p-2 rounded bg-dark-bg/80 text-dark-muted text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
