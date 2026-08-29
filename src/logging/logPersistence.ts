import { LOG_EVENT_CAP, useActionLogStore, withoutLogging, type LogEvent } from "./actionLog";

const STORAGE_PREFIX = "synapse-iwe:log:";
const MAX_BYTES = 1024 * 1024;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let currentProjectId: string | null = null;

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

function trimBySize(events: LogEvent[]): LogEvent[] {
  let capped = events.length > LOG_EVENT_CAP ? events.slice(events.length - LOG_EVENT_CAP) : events;
  while (capped.length > 0) {
    try {
      const json = JSON.stringify(capped);
      if (json.length <= MAX_BYTES) return capped;
    } catch {
      capped = capped.slice(1);
      continue;
    }
    capped = capped.slice(Math.ceil(capped.length * 0.1));
  }
  return capped;
}

function scheduleSave(projectId: string) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow(projectId);
  }, 1000);
}

export function persistNow(projectId: string) {
  if (typeof localStorage === "undefined") return;
  try {
    const events = trimBySize(useActionLogStore.getState().events);
    localStorage.setItem(storageKey(projectId), JSON.stringify(events));
  } catch {
    /* quota or private mode */
  }
}

export function hydrateLogForProject(projectId: string) {
  if (typeof localStorage === "undefined") return;
  currentProjectId = projectId;
  withoutLogging(() => {
    useActionLogStore.getState().setActiveProjectId(projectId);
  });
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return;
    const parsed = JSON.parse(raw) as LogEvent[];
    if (!Array.isArray(parsed)) return;
    useActionLogStore.getState().replaceEvents(parsed);
  } catch {
    /* corrupt storage */
  }
}

export function bindLogPersistence(projectId: string | null) {
  if (projectId === currentProjectId) return;
  if (currentProjectId) {
    persistNow(currentProjectId);
  }
  if (projectId) {
    hydrateLogForProject(projectId);
  } else {
    currentProjectId = null;
    withoutLogging(() => {
      useActionLogStore.getState().setActiveProjectId(null);
    });
  }
}

/** Subscribe to log store changes and debounce-save for active project. */
export function initLogPersistenceSubscriber() {
  useActionLogStore.subscribe((state, prev) => {
    if (state.events === prev.events) return;
    const pid = state.activeProjectId ?? currentProjectId;
    if (pid) scheduleSave(pid);
  });
}
