import { create } from "zustand";
import { sanitize } from "./sanitize";

export const LOG_ENABLED = true;
export const LOG_EVENT_CAP = 2000;
export const LOG_DISPLAY_BATCH = 500;

export type LogTier = "action" | "verbose" | "error";
export type LogCategory =
  | "node"
  | "union"
  | "person"
  | "selection"
  | "document"
  | "family"
  | "layout"
  | "ui"
  | "navigation"
  | "persistence"
  | "error";

export interface LogEvent {
  seq: number;
  t: number;
  tier: LogTier;
  category: LogCategory;
  module: string;
  label: string;
  detail?: string;
  payload?: unknown;
  durationMs?: number;
  repeat?: number;
}

export type LogEventInput = Omit<LogEvent, "seq" | "t"> & {
  t?: number;
  payload?: unknown;
};

interface ActionLogState {
  events: LogEvent[];
  paused: boolean;
  verbose: boolean;
  categoryFilter: LogCategory | null;
  searchQuery: string;
  activeProjectId: string | null;
  setPaused: (paused: boolean) => void;
  setVerbose: (verbose: boolean) => void;
  setCategoryFilter: (category: LogCategory | null) => void;
  setSearchQuery: (query: string) => void;
  setActiveProjectId: (projectId: string | null) => void;
  clear: () => void;
  appendEvents: (events: LogEvent[]) => void;
  replaceEvents: (events: LogEvent[]) => void;
}

let nextSeq = 1;
let loggingDepth = 0;
let pendingQueue: LogEventInput[] = [];
let flushScheduled = false;

function capEvents(events: LogEvent[]): LogEvent[] {
  if (events.length <= LOG_EVENT_CAP) return events;
  return events.slice(events.length - LOG_EVENT_CAP);
}

function mergeWithRepeat(existing: LogEvent[], incoming: LogEvent): LogEvent[] {
  const last = existing[existing.length - 1];
  if (
    last &&
    last.label === incoming.label &&
    last.module === incoming.module &&
    last.category === incoming.category &&
    last.detail === incoming.detail &&
    last.tier === incoming.tier
  ) {
    const updated = [...existing];
    updated[updated.length - 1] = {
      ...last,
      t: incoming.t,
      repeat: (last.repeat ?? 1) + 1,
      durationMs: incoming.durationMs ?? last.durationMs,
    };
    return updated;
  }
  return [...existing, incoming];
}

function flushQueue() {
  flushScheduled = false;
  if (pendingQueue.length === 0) return;

  const batch = pendingQueue;
  pendingQueue = [];

  const store = useActionLogStore.getState();
  if (store.paused) return;

  let next = store.events;
  for (const partial of batch) {
    const event: LogEvent = {
      seq: nextSeq++,
      t: partial.t ?? Date.now(),
      tier: partial.tier,
      category: partial.category,
      module: partial.module,
      label: partial.label,
      detail: partial.detail,
      payload: partial.payload !== undefined ? sanitize(partial.payload) : undefined,
      durationMs: partial.durationMs,
      repeat: partial.repeat,
    };
    next = mergeWithRepeat(next, event);
    next = capEvents(next);
  }

  useActionLogStore.setState({ events: next });
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(flushQueue);
  } else {
    setTimeout(flushQueue, 16);
  }
}

/** Push an event into the batched queue. Never instrument this function. */
export function logEvent(input: LogEventInput): void {
  if (!LOG_ENABLED) return;
  if (loggingDepth > 0) return;
  pendingQueue.push(input);
  scheduleFlush();
}

/** Run fn without logging recursive store writes triggered by logging itself. */
export function withoutLogging<T>(fn: () => T): T {
  loggingDepth += 1;
  try {
    return fn();
  } finally {
    loggingDepth -= 1;
  }
}

export const useActionLogStore = create<ActionLogState>((set) => ({
  events: [],
  paused: false,
  verbose: false,
  categoryFilter: null,
  searchQuery: "",
  activeProjectId: null,
  setPaused: (paused) => set({ paused }),
  setVerbose: (verbose) => set({ verbose }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
  clear: () => {
    withoutLogging(() => set({ events: [] }));
  },
  appendEvents: (events) => {
    withoutLogging(() =>
      set((s) => ({
        events: capEvents([...s.events, ...events]),
      }))
    );
  },
  replaceEvents: (events) => {
    withoutLogging(() => {
      const maxSeq = events.reduce((m, e) => Math.max(m, e.seq), 0);
      if (maxSeq >= nextSeq) nextSeq = maxSeq + 1;
      set({ events: capEvents(events) });
    });
  },
}));

export function getFilteredEvents(
  events: LogEvent[],
  opts: { verbose: boolean; categoryFilter: LogCategory | null; searchQuery: string }
): LogEvent[] {
  const q = opts.searchQuery.trim().toLowerCase();
  return events.filter((e) => {
    if (e.tier === "error") {
      // errors always visible
    } else if (e.tier === "verbose" && !opts.verbose) {
      return false;
    }
    if (opts.categoryFilter && e.category !== opts.categoryFilter) return false;
    if (!q) return true;
    const hay = `${e.label} ${e.detail ?? ""} ${e.module} ${e.category}`.toLowerCase();
    return hay.includes(q);
  });
}
