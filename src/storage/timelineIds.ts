/**
 * Timeline Outliner entity IDs.
 *
 * All timeline entity ids (lane, beat, crossing connector) use short opaque strings, matching
 * the id style used for family tree nodes (unions/people) rather than full UUIDs — they're never
 * shown to end users as "the" identifier, but they do appear in the script view, so shorter is
 * easier to scan. Use `generateTimelineId()` when creating new entities.
 */
export function generateTimelineId(): string {
  return `_${Math.random().toString(36).slice(2, 11)}`;
}
