import type { CharacterEntity, ChartLayoutTemplate } from "./chartsStore";
import { generateChartsScript } from "./chartsStore";

export type ChartsEntryKind = "chart" | "layout";

export interface ChartsFolderRecord {
  id: string;
  name: string;
  kind: ChartsEntryKind;
  sortOrder: number;
}

export interface ChartsDocumentRecord {
  id: string;
  name: string;
  content: string;
  folderId: string;
  kind: ChartsEntryKind;
  updatedAt: number;
  characterId?: string | null;
  templateId?: string | null;
  autoNamed?: boolean;
}

export function sortByOrder<T extends { sortOrder: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function nextSortOrder<T extends { sortOrder: number }>(siblings: T[]): number {
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((s) => s.sortOrder)) + 1;
}

export function defaultChartDocumentContent(characterName: string): string {
  return generateChartsScript([], {
    characterName,
    source: "characters",
  });
}

export function defaultLayoutDocumentContent(
  template: Pick<ChartLayoutTemplate, "name" | "sections" | "customDataTypes" | "builtinDataTypes">
): string {
  return generateChartsScript(template.sections ?? [], {
    characterName: template.name,
    source: "template",
    customDataTypes: template.customDataTypes,
    builtinDataTypes: template.builtinDataTypes,
  });
}

export function generateChartDocumentDisplayContent(
  doc: ChartsDocumentRecord,
  characters: CharacterEntity[],
  templates: ChartLayoutTemplate[]
): string {
  if (doc.kind === "chart" && doc.characterId) {
    const character = characters.find((c) => c.id === doc.characterId);
    if (character) {
      return generateChartsScript([character], { source: "characters" });
    }
  }
  if (doc.kind === "layout" && doc.templateId) {
    const template = templates.find((t) => t.id === doc.templateId);
    if (template) {
      return generateChartsScript(template.sections ?? [], {
        characterName: template.name,
        source: "template",
        customDataTypes: template.customDataTypes,
        builtinDataTypes: template.builtinDataTypes,
      });
    }
  }
  return doc.content;
}

export function ensureDefaultFolders(
  folders: ChartsFolderRecord[]
): { folders: ChartsFolderRecord[]; changed: boolean } {
  const next = [...folders];
  let changed = false;
  const ensure = (name: string, kind: ChartsEntryKind) => {
    if (!next.some((f) => f.kind === kind)) {
      next.push({
        id: `_${Math.random().toString(36).slice(2, 11)}`,
        name,
        kind,
        sortOrder: next.filter((f) => f.kind === kind).length,
      });
      changed = true;
    }
  };
  ensure("Charts", "chart");
  ensure("Layouts", "layout");
  return { folders: next, changed };
}

export function firstFolderIdForKind(
  folders: ChartsFolderRecord[],
  kind: ChartsEntryKind
): string | null {
  const sorted = sortByOrder(folders.filter((f) => f.kind === kind));
  return sorted[0]?.id ?? null;
}

export function ensureDocumentsForEntities(
  documents: ChartsDocumentRecord[],
  folders: ChartsFolderRecord[],
  characters: CharacterEntity[],
  templates: ChartLayoutTemplate[]
): { documents: ChartsDocumentRecord[]; changed: boolean } {
  const next = [...documents];
  let changed = false;
  const now = Date.now();
  const chartFolderId = firstFolderIdForKind(folders, "chart");
  const layoutFolderId = firstFolderIdForKind(folders, "layout");

  for (const character of characters) {
    if (next.some((d) => d.characterId === character.id)) continue;
    if (!chartFolderId) continue;
    next.push({
      id: `_${Math.random().toString(36).slice(2, 11)}`,
      name: character.name,
      content: defaultChartDocumentContent(character.name),
      folderId: chartFolderId,
      kind: "chart",
      updatedAt: now,
      characterId: character.id,
      autoNamed: true,
    });
    changed = true;
  }

  for (const template of templates) {
    if (next.some((d) => d.templateId === template.id)) continue;
    if (!layoutFolderId) continue;
    next.push({
      id: `_${Math.random().toString(36).slice(2, 11)}`,
      name: template.name,
      content: defaultLayoutDocumentContent(template),
      folderId: layoutFolderId,
      kind: "layout",
      updatedAt: now,
      templateId: template.id,
      autoNamed: true,
    });
    changed = true;
  }

  return { documents: next, changed };
}
