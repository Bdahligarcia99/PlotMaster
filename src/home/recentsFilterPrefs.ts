export type RecentsFilter = "all" | "single" | "multi";

const RECENTS_FILTER_KEY = "synapse-iwe:recentsFilter";
const LEGACY_RECENTS_FILTER_KEY = "plotmaster:recentsFilter";

const VALID: RecentsFilter[] = ["all", "single", "multi"];

export function getRecentsFilter(): RecentsFilter {
  try {
    const raw =
      localStorage.getItem(RECENTS_FILTER_KEY) ?? localStorage.getItem(LEGACY_RECENTS_FILTER_KEY);
    if (raw && VALID.includes(raw as RecentsFilter)) {
      return raw as RecentsFilter;
    }
  } catch {
    /* ignore */
  }
  return "all";
}

export function setRecentsFilter(filter: RecentsFilter): void {
  try {
    localStorage.setItem(RECENTS_FILTER_KEY, filter);
  } catch {
    /* ignore */
  }
}
