/**
 * Timeline Outliner entity IDs (Phase 0).
 *
 * All timeline entity ids (lane, beat, crossing connector) use opaque UUID strings.
 * Use `generateTimelineId()` when creating new entities in later phases.
 */
export function generateTimelineId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `_${Math.random().toString(36).slice(2, 11)}`;
}
