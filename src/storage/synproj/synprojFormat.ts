import type { ProjectPayload, TimelineProjectPayload } from "../StorageDriver";
import type { CharacterEntity, ChartLayoutTemplate, ChartSectionLayoutMode } from "../../store/characterProfilesStore";

/** Character Profiles module payload for .synproj files. */
export interface CharacterProfilesPayload {
  version: 1;
  moduleType: "characterProfiles";
  characters: CharacterEntity[];
  templates: ChartLayoutTemplate[];
  chartSectionLayout?: ChartSectionLayoutMode;
}

export type AnyModulePayload = ProjectPayload | TimelineProjectPayload | CharacterProfilesPayload;

export function isCharacterProfilesPayload(
  payload: AnyModulePayload | null | undefined
): payload is CharacterProfilesPayload {
  return payload?.moduleType === "characterProfiles";
}

/** Top-level .synproj file envelope. */
export interface SynprojFile {
  formatVersion: 1;
  savedAt: number;
  project: {
    id: string;
    name: string;
    kind: "standalone" | "modular";
    enabledModules?: string[];
    /** Module display label -> module id (for modular projects). */
    subProjects?: Record<string, string>;
  };
  /** Keyed by module id (standalone id or each subProjects value). */
  modules: Record<string, AnyModulePayload>;
}

export const SYNPROJ_EXTENSION = ".synproj";
export const SYNPROJ_MIME = "application/json";

export function createEmptySynprojFile(
  project: SynprojFile["project"],
  moduleIds: string[] = []
): SynprojFile {
  return {
    formatVersion: 1,
    savedAt: Date.now(),
    project,
    modules: Object.fromEntries(moduleIds.map((id) => [id, undefined as unknown as AnyModulePayload]).filter(Boolean)),
  };
}

export function serializeSynprojFile(data: SynprojFile): string {
  return JSON.stringify(data, null, 2);
}

export function parseSynprojFile(raw: string): SynprojFile {
  const parsed = JSON.parse(raw) as SynprojFile;
  if (parsed.formatVersion !== 1) {
    throw new Error(`Unsupported .synproj format version: ${(parsed as { formatVersion?: number }).formatVersion}`);
  }
  if (!parsed.project?.id || !parsed.modules || typeof parsed.modules !== "object") {
    throw new Error("Invalid .synproj file structure");
  }
  return parsed;
}
