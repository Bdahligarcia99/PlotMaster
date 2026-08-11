import type { TimelineDocumentRecord } from "../storage/StorageDriver";
import type { TimelineBeat, TimelineConnection, TimelineLane } from "./timelineTypes";
import { findLaneBlockSpans } from "./timelineTextBlocks";

export function buildLaneToFolderMap(
  documents: TimelineDocumentRecord[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of documents) {
    if (!doc.folderId) continue;
    for (const span of findLaneBlockSpans(doc.content)) {
      map.set(span.laneId, doc.folderId);
    }
  }
  return map;
}

export function buildBeatToFolderMap(
  beats: TimelineBeat[],
  laneToFolder: Map<string, string>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const beat of beats) {
    const folderId = laneToFolder.get(beat.laneId);
    if (folderId) map.set(beat.id, folderId);
  }
  return map;
}

/** When false, Block mode shows all lanes (legacy pre-folder projects). */
export function isFolderScopingActive(folders: { id: string }[]): boolean {
  return folders.length > 0;
}

export function getScopedLaneIds(
  documents: TimelineDocumentRecord[],
  folders: { id: string }[],
  activeFolderId: string | null
): Set<string> | null {
  if (!isFolderScopingActive(folders)) return null;
  if (!activeFolderId) return new Set();
  const laneToFolder = buildLaneToFolderMap(documents);
  const ids = new Set<string>();
  for (const [laneId, folderId] of laneToFolder) {
    if (folderId === activeFolderId) ids.add(laneId);
  }
  return ids;
}

export function filterLanesByScope(
  lanes: TimelineLane[],
  scopedLaneIds: Set<string> | null
): TimelineLane[] {
  if (scopedLaneIds === null) return lanes;
  return lanes.filter((lane) => scopedLaneIds.has(lane.id));
}

export function filterBeatsByScope(
  beats: TimelineBeat[],
  scopedLaneIds: Set<string> | null
): TimelineBeat[] {
  if (scopedLaneIds === null) return beats;
  return beats.filter((beat) => scopedLaneIds.has(beat.laneId));
}

export function filterConnectionsForActiveFolder(
  connections: TimelineConnection[],
  beats: TimelineBeat[],
  scopedLaneIds: Set<string> | null
): TimelineConnection[] {
  if (scopedLaneIds === null) return connections;
  const beatLane = new Map(beats.map((b) => [b.id, b.laneId]));
  return connections.filter((conn) =>
    conn.beatIds.every((beatId) => {
      const laneId = beatLane.get(beatId);
      return laneId != null && scopedLaneIds.has(laneId);
    })
  );
}

export function previewCrossingsTerminatedByMove(
  documents: TimelineDocumentRecord[],
  connections: TimelineConnection[],
  beats: TimelineBeat[],
  docIdsToMove: string[],
  targetFolderId: string
): TimelineConnection[] {
  const moveSet = new Set(docIdsToMove);
  const simulatedDocs = documents.map((d) =>
    moveSet.has(d.id) ? { ...d, folderId: targetFolderId } : d
  );
  const laneToFolder = buildLaneToFolderMap(simulatedDocs);
  const beatToFolder = buildBeatToFolderMap(beats, laneToFolder);

  return connections.filter((conn) => {
    const folderIds = new Set<string>();
    for (const beatId of conn.beatIds) {
      const folderId = beatToFolder.get(beatId);
      if (!folderId) return true;
      folderIds.add(folderId);
    }
    return folderIds.size > 1;
  });
}
