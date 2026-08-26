import type { ProjectData, ProjectPayload, TimelineProjectPayload } from "../../storage/StorageDriver";
import { isTimelineProjectPayload } from "../../storage/StorageDriver";
import { generateTimelineId } from "../../storage/timelineIds";
import { parseTimelineScript } from "../../store/timelineScript";
import {
  previewFamilyDocumentDeleteCounts,
  scanDocumentDeclaredIds,
} from "../../store/familyTreeDocumentHelpers";

const generateId = () => `_${Math.random().toString(36).slice(2, 11)}`;

function isFamilyTreePayload(payload: unknown): payload is ProjectPayload {
  return (payload as ProjectPayload)?.moduleType === "familyTree";
}

export function createMirrorDocument(
  registryId: string,
  payload: ProjectData,
  options?: { parentEntityId?: string; name?: string }
): { payload: ProjectData; docId: string } | null {
  if (registryId === "timeline" && isTimelineProjectPayload(payload)) {
    const folders = payload.folders ?? [];
    const folderId =
      options?.parentEntityId && options.parentEntityId !== "__unassigned__"
        ? options.parentEntityId
        : folders[0]?.id ?? null;
    const docId = generateTimelineId();
    const doc = {
      id: docId,
      name: (options?.name ?? "Untitled").trim() || "Untitled",
      content: "",
      updatedAt: Date.now(),
      folderId,
    };
    return {
      payload: { ...payload, documents: [...(payload.documents ?? []), doc] },
      docId,
    };
  }

  if (registryId === "familyTree" && isFamilyTreePayload(payload)) {
    const families = payload.families ?? [];
    const familyId = options?.parentEntityId ?? families[0]?.id ?? null;
    const docId = generateId();
    const doc = {
      id: docId,
      name: (options?.name ?? "Untitled").trim() || "Untitled",
      content: "@declarations\n\n@familyTree\n\n",
      updatedAt: Date.now(),
      familyId,
    };
    return {
      payload: { ...payload, documents: [...(payload.documents ?? []), doc] },
      docId,
    };
  }

  return null;
}

export function deleteMirrorDocument(
  registryId: string,
  payload: ProjectData,
  docId: string,
  content: string
): { payload: ProjectData; counts: Record<string, number> } | null {
  if (registryId === "timeline" && isTimelineProjectPayload(payload)) {
    const parsed = parseTimelineScript(content);
    const laneIds = new Set(parsed.lanes.map((l: { id: string }) => l.id));
    const beatIds = new Set(parsed.beats.map((b: { id: string }) => b.id));
    const crossingIds = new Set(parsed.connections.map((c: { id: string }) => c.id));

    const removedBeatIds = new Set<string>();
    for (const beat of payload.beats ?? []) {
      if (beatIds.has(beat.id) || laneIds.has(beat.laneId)) {
        removedBeatIds.add(beat.id);
      }
    }

    const lanes = (payload.lanes ?? [])
      .filter((lane) => !laneIds.has(lane.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((lane, index) => ({ ...lane, sortOrder: index }));
    const beats = (payload.beats ?? []).filter((b) => !removedBeatIds.has(b.id));
    const connections = (payload.connections ?? []).filter((c) => {
      if (crossingIds.has(c.id)) return false;
      return !c.beatIds.some((id) => removedBeatIds.has(id));
    });

    return {
      payload: {
        ...payload,
        lanes,
        beats,
        connections,
        documents: (payload.documents ?? []).filter((d) => d.id !== docId),
      },
      counts: {
        laneCount: laneIds.size,
        beatCount: beatIds.size,
        crossingCount: crossingIds.size,
      },
    };
  }

  if (registryId === "familyTree" && isFamilyTreePayload(payload)) {
    const counts = previewFamilyDocumentDeleteCounts(content);
    const { personIds, unionIds } = scanDocumentDeclaredIds(content);
    const declaredIds = [...personIds, ...unionIds];
    const idToDocs = new Map<string, Set<string>>();
    for (const doc of payload.documents ?? []) {
      const scanned = scanDocumentDeclaredIds(doc.id === docId ? content : doc.content);
      for (const pid of scanned.personIds) {
        if (!idToDocs.has(pid)) idToDocs.set(pid, new Set());
        idToDocs.get(pid)!.add(doc.id);
      }
      for (const uid of scanned.unionIds) {
        if (!idToDocs.has(uid)) idToDocs.set(uid, new Set());
        idToDocs.get(uid)!.add(doc.id);
      }
    }
    const uniqueIds = declaredIds.filter((nodeId) => {
      const docs = idToDocs.get(nodeId);
      return docs?.size === 1 && docs.has(docId);
    });
    const removeSet = new Set(uniqueIds);

    return {
      payload: {
        ...payload,
        nodes: (payload.nodes ?? []).filter((n) => !removeSet.has(n.id)),
        edges: (payload.edges ?? []).filter(
          (e) => !removeSet.has(e.source) && !removeSet.has(e.target)
        ),
        documents: (payload.documents ?? []).filter((d) => d.id !== docId),
      },
      counts: { personCount: counts.personCount, unionCount: counts.unionCount },
    };
  }

  return null;
}

export function getMirrorDocumentParentId(
  registryId: string,
  payload: ProjectData,
  entityId: string
): string | null {
  if (registryId === "timeline" && isTimelineProjectPayload(payload)) {
    const doc = (payload.documents ?? []).find((d) => d.id === entityId);
    return doc?.folderId ?? null;
  }
  if (registryId === "familyTree" && isFamilyTreePayload(payload)) {
    const doc = (payload.documents ?? []).find((d) => d.id === entityId);
    return doc?.familyId ?? null;
  }
  return null;
}

export function getMirrorDocumentName(
  _registryId: string,
  payload: ProjectData,
  entityId: string
): string {
  const doc = (payload as TimelineProjectPayload | ProjectPayload).documents?.find(
    (d) => d.id === entityId
  );
  return doc?.name ?? "Untitled";
}
