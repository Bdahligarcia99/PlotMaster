import type { ProjectPayload, TimelineProjectPayload, NeuronProjectPayload } from "../StorageDriver";
import type { CharacterEntity, ChartLayoutTemplate, ChartSectionLayoutMode } from "../../store/chartsStore";

/** Charts module payload for .synproj files. */
export interface ChartsPayload {
  version: 1;
  moduleType: "charts";
  displayMode?: "charts";
  characters: CharacterEntity[];
  templates: ChartLayoutTemplate[];
  chartSectionLayout?: ChartSectionLayoutMode;
}

/** @deprecated Use ChartsPayload — legacy persisted moduleType value. */
export interface LegacyCharacterProfilesPayload {
  version: 1;
  moduleType: "characterProfiles";
  characters: CharacterEntity[];
  templates: ChartLayoutTemplate[];
  chartSectionLayout?: ChartSectionLayoutMode;
}

export type AnyModulePayload = ProjectPayload | TimelineProjectPayload | ChartsPayload | NeuronProjectPayload;

export function isChartsPayload(
  payload: AnyModulePayload | null | undefined
): payload is ChartsPayload {
  const moduleType = (payload as { moduleType?: string } | null | undefined)?.moduleType;
  return moduleType === "charts" || moduleType === "characterProfiles";
}

/** Normalizes a loaded payload to ChartsPayload (migrates legacy moduleType on read). */
export function normalizeChartsPayload(
  payload: AnyModulePayload | null | undefined
): ChartsPayload | null {
  if (!payload || !isChartsPayload(payload)) return null;
  if (payload.moduleType === "charts") return payload;
  const legacy = payload as LegacyCharacterProfilesPayload;
  return {
    version: legacy.version,
    moduleType: "charts",
    displayMode: "charts",
    characters: legacy.characters,
    templates: legacy.templates,
    chartSectionLayout: legacy.chartSectionLayout,
  };
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
