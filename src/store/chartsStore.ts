import { create } from "zustand";
import { instrument } from "../logging/instrumentStore";
import {
  isFileBackedProject,
  loadModulePayloadFromFile,
  saveModulePayloadToFile,
} from "../storage/synproj/synprojProjectService";
import { normalizeChartsPayload } from "../storage/synproj/synprojFormat";
import { parseChartsScript } from "../parseChartsScript";
import {
  type ChartsDocumentRecord,
  type ChartsEntryKind,
  type ChartsFolderRecord,
  defaultChartDocumentContent,
  defaultLayoutDocumentContent,
  ensureDefaultFolders,
  ensureDocumentsForEntities,
  generateChartDocumentDisplayContent,
  nextSortOrder,
  sortByOrder,
} from "./chartsDocumentHelpers";

const CHARTS_STORAGE_KEY = (projectId: string) =>
  `synapse-iwe:charts:${projectId}`;
const LEGACY_PROFILES_STORAGE_KEY = (projectId: string) =>
  `synapse-iwe:profiles:${projectId}`;
const SUPER_LEGACY_PROFILES_STORAGE_KEY = (projectId: string) =>
  `plotmaster:profiles:${projectId}`;

const TEMPLATES_STORAGE_KEY = (projectId: string) =>
  `synapse-iwe:charts:templates:${projectId}`;
const LEGACY_TEMPLATES_STORAGE_KEY = (projectId: string) =>
  `synapse-iwe:profiles:templates:${projectId}`;
const SUPER_LEGACY_TEMPLATES_STORAGE_KEY = (projectId: string) =>
  `plotmaster:profiles:templates:${projectId}`;

const CHART_SECTION_LAYOUT_KEY = (projectId: string) =>
  `synapse-iwe:charts:chartSectionLayout:${projectId}`;
const LEGACY_CHART_SECTION_LAYOUT_KEY = (projectId: string) =>
  `synapse-iwe:profiles:chartSectionLayout:${projectId}`;
const SUPER_LEGACY_CHART_SECTION_LAYOUT_KEY = (projectId: string) =>
  `plotmaster:profiles:chartSectionLayout:${projectId}`;

const FOLDERS_STORAGE_KEY = (projectId: string) =>
  `synapse-iwe:charts:folders:${projectId}`;
const DOCUMENTS_STORAGE_KEY = (projectId: string) =>
  `synapse-iwe:charts:documents:${projectId}`;

export type SectionHeadingLevel = "h1" | "h2" | "h3" | "h4";

/** Note block - section-scoped note */
export interface NoteBlock {
  type: "note";
  id: string;
  content: string;
}

export type AttributeType = "text" | "number" | "numberScroll" | "date" | "custom";

/** Custom data type defined at template level */
export interface CustomDataType {
  id: string;
  name: string;
  options: string[];
}

/** Metadata per attribute key - optional; missing = treat as text */
export interface AttributeMetaItem {
  type?: AttributeType;
  /** When type is "custom", references CustomDataType.id */
  customTypeId?: string;
  options?: string[];
  allowCustom?: boolean;
  /** For number / numberScroll: optional min value */
  min?: number;
  /** For number / numberScroll: optional max value */
  max?: number;
  /** For number / numberScroll: optional step */
  step?: number;
}

/** Attribute block - key/value pairs with order and optional metadata */
export interface AttributeBlock {
  type: "attributes";
  id: string;
  keyValuePairs: Record<string, string>;
  attributeOrder?: string[];
  attributeMeta?: Record<string, AttributeMetaItem>;
}

/** Image block - placeholder with optional label and URL */
export interface ImageBlock {
  type: "image";
  id: string;
  label?: string;
  imageUrl?: string;
}

export type ContentBlock = NoteBlock | AttributeBlock | ImageBlock;

/** Profile section - hierarchical (H1 top-level, H2 nested) */
export interface ProfileSection {
  id: string;
  label: string;
  headingLevel: SectionHeadingLevel;
  parentId: string | null; // null = H1 top-level; string = H2 under that H1
  contentBlocks: ContentBlock[];
  order: number;
}

export interface CharacterEntity {
  id: string;
  name: string;
  sections: ProfileSection[];
  /** When set, layout is driven by this template; changes propagate on template save */
  linkedTemplateId?: string | null;
  /** Snapshot of template customDataTypes when layout was applied; used to resolve customTypeId */
  customDataTypes?: CustomDataType[];
}

/** Chart layout template - structure only, no character-specific values */
export interface ChartLayoutTemplate {
  id: string;
  name: string;
  createdAt?: number;
  customDataTypes?: CustomDataType[];
  /** Stored @builtin lines from the script (e.g. @builtin number: [0, 120, 1]) */
  builtinDataTypes?: string[];
  sections: ProfileSection[];
}

export type ChartLayoutMode = "fill" | "edit" | "createLayout";

export type ChartSectionLayoutMode = "list" | "grid";

export type ChartsDisplayMode = "charts" | "text";

interface ChartsStore {
  activeProjectId: string | null;
  characters: CharacterEntity[];
  selectedCharacterId: string | null;
  comparisonCharacterId: string | null;
  chartLayoutMode: ChartLayoutMode;
  editLayoutDirty: boolean;
  editLayoutDraftSections: ProfileSection[];
  editLayoutDraftDataTypes: CustomDataType[];
  editingTemplateId: string | null;
  createLayoutDirty: boolean;
  createLayoutDraftSections: ProfileSection[];
  createLayoutDraftDataTypes: CustomDataType[];
  createLayoutDraftBuiltinDataTypes: string[];
  chartSectionLayoutMode: ChartSectionLayoutMode;
  displayMode: ChartsDisplayMode;
  folders: ChartsFolderRecord[];
  documents: ChartsDocumentRecord[];
  activeFolderId: string | null;
  activeDocumentId: string | null;
  dirtyDocumentIds: string[];
  setDisplayMode: (mode: ChartsDisplayMode) => void;
  setDirtyDocumentIds: (ids: string[]) => void;
  setActiveFolderId: (folderId: string | null) => void;
  setActiveDocumentId: (docId: string | null) => void;
  ensureDefaultFolders: () => void;
  ensureDocumentsForEntities: () => void;
  getDocumentDisplayContent: (docId: string) => string;
  applyChartsDocumentEdits: (
    edits: { docId: string; content: string }[]
  ) => { ok: true } | { ok: false; errors: string[] };
  updateTemplateSections: (
    projectId: string,
    templateId: string,
    sections: ProfileSection[],
    customDataTypes?: CustomDataType[],
    builtinDataTypes?: string[]
  ) => boolean;
  createFolder: (name: string, kind: ChartsEntryKind) => string;
  renameFolder: (folderId: string, name: string) => void;
  deleteFolderCascade: (folderId: string) => { ok: true } | { ok: false; reason: "lastOfKind" };
  createDocument: (kind: ChartsEntryKind, folderId?: string, name?: string) => string;
  renameDocument: (docId: string, name: string) => void;
  deleteDocument: (docId: string) => void;
  moveDocument: (
    docId: string,
    folderId: string
  ) => { ok: true } | { ok: false; reason: "kindMismatch" };
  getDocumentForCharacter: (characterId: string) => ChartsDocumentRecord | null;
  getDocumentForTemplate: (templateId: string) => ChartsDocumentRecord | null;
  setChartSectionLayoutMode: (mode: ChartSectionLayoutMode) => void;
  setActiveProject: (projectId: string | null) => void;
  setSelectedCharacter: (characterId: string | null, shiftKey?: boolean) => void;
  exitComparison: () => void;
  setChartLayoutMode: (mode: ChartLayoutMode) => void;
  setEditLayoutDirty: (dirty: boolean) => void;
  setEditLayoutDraftSections: (sections: ProfileSection[]) => void;
  setEditLayoutDraftDataTypes: (types: CustomDataType[]) => void;
  applyEditLayoutDraftToCharacter: (projectId: string, characterId: string) => boolean;
  setCreateLayoutDraftSections: (sections: ProfileSection[]) => void;
  setCreateLayoutDraftDataTypes: (types: CustomDataType[]) => void;
  setCreateLayoutDraftBuiltinDataTypes: (lines: string[]) => void;
  loadCharacters: (projectId: string) => void;
  addCharacter: (projectId: string, name?: string) => string;
  removeCharacter: (projectId: string, characterId: string) => void;
  updateCharacterName: (projectId: string, characterId: string, name: string) => void;

  // Sections
  addSection: (projectId: string, characterId: string, parentId?: string | null, label?: string) => string;
  updateSectionLabel: (projectId: string, characterId: string, sectionId: string, label: string) => void;
  updateSectionHeadingLevel: (projectId: string, characterId: string, sectionId: string, level: SectionHeadingLevel) => void;
  removeSection: (projectId: string, characterId: string, sectionId: string) => void;
  reorderSections: (projectId: string, characterId: string, parentId: string | null, fromIndex: number, toIndex: number) => void;
  moveSectionTo: (projectId: string, characterId: string, sectionId: string, targetParentId: string | null, targetSectionId: string) => void;
  nestSection: (projectId: string, characterId: string, sectionId: string, newParentId: string | null) => void;

  // Content blocks
  addContentBlock: (projectId: string, characterId: string, sectionId: string, blockType: "note" | "attributes" | "image") => string;
  addAttributeToSection: (projectId: string, characterId: string, sectionId: string) => void;
  updateContentBlock: (projectId: string, characterId: string, sectionId: string, blockId: string, updates: Partial<NoteBlock> | Partial<AttributeBlock> | Partial<ImageBlock>) => void;
  removeContentBlock: (projectId: string, characterId: string, sectionId: string, blockId: string) => void;
  reorderContentBlocks: (projectId: string, characterId: string, sectionId: string, fromIndex: number, toIndex: number) => void;

  // Attribute block specifics
  addAttributeKey: (projectId: string, characterId: string, sectionId: string, blockId: string, key?: string, value?: string) => void;
  updateAttributeKey: (projectId: string, characterId: string, sectionId: string, blockId: string, key: string, value: string) => void;
  removeAttributeKey: (projectId: string, characterId: string, sectionId: string, blockId: string, key: string) => void;
  renameAttributeKey: (projectId: string, characterId: string, sectionId: string, blockId: string, oldKey: string, newKey: string) => void;
  reorderAttributeKeys: (projectId: string, characterId: string, sectionId: string, blockId: string, fromIndex: number, toIndex: number) => void;
  updateAttributeMeta: (projectId: string, characterId: string, sectionId: string, blockId: string, key: string, meta: Partial<AttributeMetaItem>) => void;

  // Chart layout templates
  listTemplates: (projectId: string) => ChartLayoutTemplate[];
  saveTemplateFromCharacter: (projectId: string, characterId: string, name: string) => string | null;
  applyTemplateToCharacter: (projectId: string, characterId: string, templateId: string, mode: "replace" | "link") => void;
  unlinkCharacterFromTemplate: (projectId: string, characterId: string) => void;
  getTemplateById: (projectId: string, templateId: string) => ChartLayoutTemplate | null;
  syncLinkedCharacterWithTemplate: (projectId: string, characterId: string) => boolean;
  loadTemplateForEditing: (projectId: string, templateId: string) => void;
  updateTemplate: (projectId: string, templateId: string) => boolean;
  renameTemplate: (projectId: string, templateId: string, name: string) => void;
  deleteTemplate: (projectId: string, templateId: string) => void;
  createTemplateFromSections: (projectId: string, name: string, sections: ProfileSection[], customDataTypes?: CustomDataType[], builtinDataTypes?: string[]) => string | null;
  applyProfilesFromScript: (projectId: string, characters: CharacterEntity[]) => void;
}

function generateId() {
  return `_${Math.random().toString(36).slice(2, 11)}`;
}

/** Legacy types for migration */
interface LegacyAttributeCategory {
  id: string;
  name: string;
  headingLevel?: string;
  attributes?: Record<string, string>;
  attributeOrder?: string[];
}

interface LegacyNoteBlock {
  id: string;
  content: string;
  position: { type: string; categoryId?: string; afterAttributeKey?: string };
  order: number;
}

function migrateCharacter(c: {
  id: string;
  name: string;
  attributes?: Record<string, string>;
  categories?: LegacyAttributeCategory[];
  notes?: LegacyNoteBlock[];
  sections?: ProfileSection[];
}): CharacterEntity {
  // Already migrated
  if (c.sections && Array.isArray(c.sections)) {
    const ce = c as CharacterEntity & { linkedTemplateId?: string | null };
    return {
      id: c.id,
      name: c.name,
      sections: ce.sections.map((s) => ({
        ...s,
        contentBlocks: s.contentBlocks ?? [],
      })),
      linkedTemplateId: ce.linkedTemplateId ?? null,
    };
  }

  const sections: ProfileSection[] = [];
  const legacyCats = c.categories ?? [];
  const legacyNotes = (c as { notes?: LegacyNoteBlock[] }).notes ?? [];

  if (legacyCats.length > 0) {
    legacyCats.forEach((cat, idx) => {
      const contentBlocks: ContentBlock[] = [];

      // Before-category notes → NoteBlocks at start
      const beforeNotes = legacyNotes.filter(
        (n) => n.position?.type === "beforeCategory" && n.position?.categoryId === cat.id
      );
      beforeNotes
        .sort((a, b) => a.order - b.order)
        .forEach((n) => {
          contentBlocks.push({ type: "note", id: n.id, content: n.content });
        });

      // Attributes → AttributeBlock
      const attrs = cat.attributes ?? {};
      const order = cat.attributeOrder ?? Object.keys(attrs);
      if (Object.keys(attrs).length > 0) {
        contentBlocks.push({
          type: "attributes",
          id: generateId(),
          keyValuePairs: { ...attrs },
          attributeOrder: order.filter((k) => k in attrs),
        });
      }

      // Between-attributes notes: we can't easily place them in the new model since
      // we have one AttributeBlock. Merge into a note after the attribute block for now.
      // After-category notes → NoteBlocks at end
      const afterNotes = legacyNotes.filter(
        (n) => n.position?.type === "afterCategory" && n.position?.categoryId === cat.id
      );
      afterNotes
        .sort((a, b) => a.order - b.order)
        .forEach((n) => {
          contentBlocks.push({ type: "note", id: n.id, content: n.content });
        });

      sections.push({
        id: cat.id || generateId(),
        label: cat.name || "New section",
        headingLevel: (["h1", "h2", "h3", "h4"] as const).includes((cat.headingLevel ?? "h1") as SectionHeadingLevel)
          ? ((cat.headingLevel ?? "h1") as SectionHeadingLevel)
          : "h1",
        parentId: null,
        contentBlocks,
        order: idx,
      });
    });
  } else if (Object.keys(c.attributes ?? {}).length > 0) {
    const attrs = c.attributes!;
    sections.push({
      id: generateId(),
      label: "General",
      headingLevel: "h1",
      parentId: null,
      contentBlocks: [
        {
          type: "attributes",
          id: generateId(),
          keyValuePairs: { ...attrs },
          attributeOrder: Object.keys(attrs),
        },
      ],
      order: 0,
    });
  }

  return { id: c.id, name: c.name, sections, linkedTemplateId: null };
}

function loadFromStorage(projectId: string): CharacterEntity[] {
  try {
    const raw =
      localStorage.getItem(CHARTS_STORAGE_KEY(projectId)) ??
      localStorage.getItem(LEGACY_PROFILES_STORAGE_KEY(projectId)) ??
      localStorage.getItem(SUPER_LEGACY_PROFILES_STORAGE_KEY(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    return parsed.map(migrateCharacter);
  } catch {
    return [];
  }
}

function saveToStorage(projectId: string, characters: CharacterEntity[]) {
  try {
    localStorage.setItem(
      CHARTS_STORAGE_KEY(projectId),
      JSON.stringify(characters)
    );
  } catch (e) {
    console.warn("[ChartsStore] Save failed:", e);
  }
  void persistChartsModuleToFile(projectId);
}

function loadChartSectionLayoutMode(projectId: string): ChartSectionLayoutMode {
  try {
    const raw =
      localStorage.getItem(CHART_SECTION_LAYOUT_KEY(projectId)) ??
      localStorage.getItem(LEGACY_CHART_SECTION_LAYOUT_KEY(projectId)) ??
      localStorage.getItem(SUPER_LEGACY_CHART_SECTION_LAYOUT_KEY(projectId));
    if (raw === "grid") return "grid";
  } catch {
    /* ignore */
  }
  return "list";
}

function saveChartSectionLayoutMode(projectId: string, mode: ChartSectionLayoutMode) {
  try {
    localStorage.setItem(CHART_SECTION_LAYOUT_KEY(projectId), mode);
  } catch {
    /* ignore */
  }
  void persistChartsModuleToFile(projectId);
}

function loadTemplatesFromStorage(projectId: string): ChartLayoutTemplate[] {
  try {
    const raw =
      localStorage.getItem(TEMPLATES_STORAGE_KEY(projectId)) ??
      localStorage.getItem(LEGACY_TEMPLATES_STORAGE_KEY(projectId)) ??
      localStorage.getItem(SUPER_LEGACY_TEMPLATES_STORAGE_KEY(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTemplatesToStorage(projectId: string, templates: ChartLayoutTemplate[]) {
  try {
    localStorage.setItem(
      TEMPLATES_STORAGE_KEY(projectId),
      JSON.stringify(templates)
    );
  } catch (e) {
    console.warn("[ChartsStore] Template save failed:", e);
  }
  void persistChartsModuleToFile(projectId);
}

function loadFoldersFromStorage(projectId: string): ChartsFolderRecord[] {
  try {
    const raw = localStorage.getItem(FOLDERS_STORAGE_KEY(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFoldersToStorage(projectId: string, folders: ChartsFolderRecord[]) {
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY(projectId), JSON.stringify(folders));
  } catch (e) {
    console.warn("[ChartsStore] Folder save failed:", e);
  }
  void persistChartsModuleToFile(projectId);
}

function loadDocumentsFromStorage(projectId: string): ChartsDocumentRecord[] {
  try {
    const raw = localStorage.getItem(DOCUMENTS_STORAGE_KEY(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDocumentsToStorage(projectId: string, documents: ChartsDocumentRecord[]) {
  try {
    localStorage.setItem(DOCUMENTS_STORAGE_KEY(projectId), JSON.stringify(documents));
  } catch (e) {
    console.warn("[ChartsStore] Document save failed:", e);
  }
  void persistChartsModuleToFile(projectId);
}

function loadDisplayModeFromStorage(projectId: string): ChartsDisplayMode {
  try {
    const raw = localStorage.getItem(`synapse-iwe:charts:displayMode:${projectId}`);
    if (raw === "text") return "text";
  } catch {
    /* ignore */
  }
  return "charts";
}

function saveDisplayModeToStorage(projectId: string, mode: ChartsDisplayMode) {
  try {
    localStorage.setItem(`synapse-iwe:charts:displayMode:${projectId}`, mode);
  } catch {
    /* ignore */
  }
  void persistChartsModuleToFile(projectId);
}

function loadActiveFolderIdFromStorage(projectId: string): string | null {
  try {
    const raw = localStorage.getItem(`synapse-iwe:charts:activeFolderId:${projectId}`);
    return raw || null;
  } catch {
    return null;
  }
}

function saveActiveFolderIdToStorage(projectId: string, folderId: string | null) {
  try {
    if (folderId) {
      localStorage.setItem(`synapse-iwe:charts:activeFolderId:${projectId}`, folderId);
    } else {
      localStorage.removeItem(`synapse-iwe:charts:activeFolderId:${projectId}`);
    }
  } catch {
    /* ignore */
  }
  void persistChartsModuleToFile(projectId);
}

function createChartDocumentRecord(
  character: CharacterEntity,
  folderId: string
): ChartsDocumentRecord {
  return {
    id: generateId(),
    name: character.name,
    content: defaultChartDocumentContent(character.name),
    folderId,
    kind: "chart",
    updatedAt: Date.now(),
    characterId: character.id,
    autoNamed: true,
  };
}

function createLayoutDocumentRecord(
  template: ChartLayoutTemplate,
  folderId: string
): ChartsDocumentRecord {
  return {
    id: generateId(),
    name: template.name,
    content: defaultLayoutDocumentContent(template),
    folderId,
    kind: "layout",
    updatedAt: Date.now(),
    templateId: template.id,
    autoNamed: true,
  };
}

async function persistChartsModuleToFile(projectId: string): Promise<void> {
  if (!(await isFileBackedProject(projectId))) return;
  try {
    const payload = {
      version: 1 as const,
      moduleType: "charts" as const,
      displayMode: loadDisplayModeFromStorage(projectId),
      characters: loadFromStorage(projectId),
      templates: loadTemplatesFromStorage(projectId),
      chartSectionLayout: loadChartSectionLayoutMode(projectId),
      folders: loadFoldersFromStorage(projectId),
      documents: loadDocumentsFromStorage(projectId),
      activeFolderId: loadActiveFolderIdFromStorage(projectId),
    };
    await saveModulePayloadToFile(projectId, payload);
  } catch (e) {
    console.warn("[ChartsStore] File save failed:", e);
  }
}

/** Strip values from character sections to create template structure */
function sectionsToTemplateFormat(sections: ProfileSection[]): ProfileSection[] {
  const oldToNewSectionId = new Map<string, string>();
  const result: ProfileSection[] = [];
  const ordered = getOrderedSections(sections);

  for (const s of ordered) {
    const newId = generateId();
    oldToNewSectionId.set(s.id, newId);
    const blocks: ContentBlock[] = (s.contentBlocks ?? []).map((b) => {
      if (b.type === "note") {
        return { type: "note" as const, id: generateId(), content: (b as NoteBlock).content ?? "" };
      }
      if (b.type === "attributes") {
        const keys = b.attributeOrder ?? Object.keys(b.keyValuePairs ?? {});
        const keyValuePairs: Record<string, string> = {};
        for (const k of keys) if (k in (b.keyValuePairs ?? {})) keyValuePairs[k] = "";
        const meta = b.attributeMeta ?? {};
        const attributeMeta: Record<string, AttributeMetaItem> = {};
        for (const k of keys) {
          if (meta[k]) {
            const m = meta[k];
            const opts = m.options ?? [];
            attributeMeta[k] = {
              type: m.type ?? "text",
              customTypeId: m.customTypeId,
              options: [...new Set(opts)],
              allowCustom: m.allowCustom ?? false,
              min: m.min,
              max: m.max,
              step: m.step,
            };
          }
        }
        return {
          type: "attributes" as const,
          id: generateId(),
          keyValuePairs,
          attributeOrder: keys.filter((k) => k in keyValuePairs),
          attributeMeta: Object.keys(attributeMeta).length > 0 ? attributeMeta : undefined,
        };
      }
      if (b.type === "image") {
        return { type: "image" as const, id: generateId(), label: b.label, imageUrl: undefined };
      }
      return b;
    });
    result.push({
      id: newId,
      label: s.label,
      headingLevel: s.headingLevel,
      parentId: s.parentId ? (oldToNewSectionId.get(s.parentId) ?? null) : null,
      contentBlocks: blocks,
      order: s.order,
    });
  }
  return result;
}

/** Apply template sections to character, generating new IDs and remapping parentId */
function applyTemplateSections(
  templateSections: ProfileSection[],
  existingSections: ProfileSection[],
  mode: "replace" | "merge"
): ProfileSection[] {
  const templateOrdered = getOrderedSections(templateSections);

  if (mode === "replace") {
    return templateSectionsToCharacter(templateOrdered);
  }

  const existingOrdered = getOrderedSections(existingSections);
  const existingByLabel = new Map<string, ProfileSection>();
  for (const s of existingOrdered) {
    existingByLabel.set(s.label.toLowerCase(), s);
  }
  const existingAttrKeys = new Map<string, Set<string>>();
  for (const s of existingOrdered) {
    const keys = new Set<string>();
    for (const b of s.contentBlocks ?? []) {
      if (b.type === "attributes") {
        for (const k of b.attributeOrder ?? Object.keys(b.keyValuePairs ?? {})) keys.add(k);
      }
    }
    existingAttrKeys.set(s.label.toLowerCase(), keys);
  }

  const templateIdToCharId = new Map<string, string>();
  const result: ProfileSection[] = [...existingOrdered];
  let maxOrder = Math.max(-1, ...existingOrdered.map((s) => s.order)) + 1;

  const imageLabelExists = (blocks: ContentBlock[], label: string): boolean => {
    const normalized = (label ?? "").trim().toLowerCase();
    if (!normalized) return false;
    return (blocks ?? []).some((b) => b.type === "image" && ((b as ImageBlock).label ?? "").trim().toLowerCase() === normalized);
  };

  for (const ts of templateOrdered) {
    const labelKey = ts.label.toLowerCase();
    const existing = existingByLabel.get(labelKey);
    if (existing) {
      templateIdToCharId.set(ts.id, existing.id);
      const attrKeys = existingAttrKeys.get(labelKey) ?? new Set();
      const charBlocks = existing.contentBlocks ?? [];

      // 1. Attributes: add new keys with empty value, sync meta for existing keys
      for (const tb of ts.contentBlocks ?? []) {
        if (tb.type !== "attributes") continue;
        const templateKeys = tb.attributeOrder ?? Object.keys(tb.keyValuePairs ?? {});
        const keysToAdd = templateKeys.filter((k) => !attrKeys.has(k));
        const block = charBlocks.find((b): b is AttributeBlock => b.type === "attributes");
        const tbMeta = (tb as AttributeBlock).attributeMeta ?? {};
        if (block) {
          const pairs = { ...block.keyValuePairs };
          const order = [...(block.attributeOrder ?? Object.keys(pairs))];
          const attributeMeta = { ...(block.attributeMeta ?? {}) };
          for (const k of keysToAdd) {
            pairs[k] = "";
            order.push(k);
            attrKeys.add(k);
          }
          for (const k of templateKeys) {
            if (tbMeta[k]) {
              const m = tbMeta[k];
              attributeMeta[k] = {
                type: m.type ?? "text",
                customTypeId: m.customTypeId,
                options: m.options ? [...new Set(m.options)] : undefined,
                allowCustom: m.allowCustom,
                min: m.min,
                max: m.max,
                step: m.step,
              };
            }
          }
          existing.contentBlocks = (existing.contentBlocks ?? []).map((b) =>
            b.type === "attributes" && b.id === block.id
              ? { ...b, keyValuePairs: pairs, attributeOrder: order, attributeMeta: Object.keys(attributeMeta).length > 0 ? attributeMeta : undefined }
              : b
          );
        } else if (keysToAdd.length > 0) {
          const attributeMeta: Record<string, AttributeMetaItem> = {};
          for (const k of keysToAdd) {
            if (tbMeta[k]) {
              const m = tbMeta[k];
              attributeMeta[k] = { type: m.type ?? "text", customTypeId: m.customTypeId, options: m.options ? [...new Set(m.options)] : undefined, allowCustom: m.allowCustom, min: m.min, max: m.max, step: m.step };
            }
          }
          existing.contentBlocks = [
            ...(existing.contentBlocks ?? []),
            {
              type: "attributes" as const,
              id: generateId(),
              keyValuePairs: Object.fromEntries(keysToAdd.map((k) => [k, ""])),
              attributeOrder: keysToAdd,
              attributeMeta: Object.keys(attributeMeta).length > 0 ? attributeMeta : undefined,
            },
          ];
          keysToAdd.forEach((k) => attrKeys.add(k));
        }
      }

      // 2. Notes: update empty notes from template; add new notes with template content
      const charNotes = charBlocks.filter((b): b is NoteBlock => b.type === "note");
      const templateNotes = (ts.contentBlocks ?? []).filter((b): b is NoteBlock => b.type === "note");
      const updatedNotes: NoteBlock[] = [];
      for (let i = 0; i < Math.max(charNotes.length, templateNotes.length); i++) {
        const tNote = templateNotes[i];
        const cNote = charNotes[i];
        const isEmpty = (s: string | undefined) => (s ?? "").trim() === "";
        if (tNote) {
          if (cNote) {
            updatedNotes.push(isEmpty(cNote.content) ? { ...cNote, content: tNote.content ?? "" } : cNote);
          } else {
            updatedNotes.push({ type: "note" as const, id: generateId(), content: tNote.content ?? "" });
          }
        } else if (cNote) {
          updatedNotes.push(cNote);
        }
      }
      let noteIdx = 0;
      const newBlocks: ContentBlock[] = [];
      for (const b of existing.contentBlocks ?? []) {
        if (b.type === "note") {
          if (noteIdx < updatedNotes.length) newBlocks.push(updatedNotes[noteIdx++]);
        } else {
          newBlocks.push(b);
        }
      }
      while (noteIdx < updatedNotes.length) newBlocks.push(updatedNotes[noteIdx++]);
      existing.contentBlocks = newBlocks;

      // 3. Images: add only if no block with same label exists
      for (const tb of ts.contentBlocks ?? []) {
        if (tb.type !== "image") continue;
        const img = tb as ImageBlock;
        if (imageLabelExists(existing.contentBlocks ?? [], img.label ?? "")) continue;
        existing.contentBlocks = [
          ...(existing.contentBlocks ?? []),
          { type: "image" as const, id: generateId(), label: img.label },
        ];
      }
    } else {
      const newParentId = ts.parentId ? (templateIdToCharId.get(ts.parentId) ?? null) : null;
      const newSection = templateSectionToCharacter(ts, newParentId, maxOrder++);
      templateIdToCharId.set(ts.id, newSection.id);
      result.push(newSection);
      existingByLabel.set(labelKey, newSection);
      existingAttrKeys.set(labelKey, new Set());
    }
  }
  return result;
}

function templateSectionToCharacter(
  s: ProfileSection,
  parentId: string | null,
  order: number
): ProfileSection {
  const newId = generateId();
  const blocks: ContentBlock[] = (s.contentBlocks ?? []).map((b) => {
    if (b.type === "note") return { type: "note" as const, id: generateId(), content: (b as NoteBlock).content ?? "" };
    if (b.type === "attributes") {
      const keys = b.attributeOrder ?? Object.keys(b.keyValuePairs ?? {});
      const meta = b.attributeMeta ?? {};
      const attributeMeta: Record<string, AttributeMetaItem> = {};
      for (const k of keys) {
        if (meta[k]) {
          const m = meta[k];
          attributeMeta[k] = {
            type: m.type ?? "text",
            customTypeId: m.customTypeId,
            options: m.options ? [...new Set(m.options)] : undefined,
            allowCustom: m.allowCustom,
            min: m.min,
            max: m.max,
            step: m.step,
          };
        }
      }
      return {
        type: "attributes" as const,
        id: generateId(),
        keyValuePairs: Object.fromEntries(keys.map((k) => [k, ""])),
        attributeOrder: keys,
        attributeMeta: Object.keys(attributeMeta).length > 0 ? attributeMeta : undefined,
      };
    }
    if (b.type === "image") return { type: "image" as const, id: generateId(), label: b.label };
    return b;
  });
  return { id: newId, label: s.label, headingLevel: s.headingLevel, parentId, contentBlocks: blocks, order };
}

function templateSectionsToCharacter(templateOrdered: ProfileSection[]): ProfileSection[] {
  const templateIdToNewId = new Map<string, string>();
  const byParent = new Map<string | null, ProfileSection[]>();
  for (const s of templateOrdered) {
    const p = s.parentId ?? null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(s);
  }
  const result: ProfileSection[] = [];
  function add(parentId: string | null, orderStart: number) {
    const children = byParent.get(parentId) ?? [];
    children.sort((a, b) => a.order - b.order);
    for (let i = 0; i < children.length; i++) {
      const s = children[i];
      const newParentId = parentId ? templateIdToNewId.get(parentId) ?? null : null;
      const newSection = templateSectionToCharacter(s, newParentId, orderStart + i);
      templateIdToNewId.set(s.id, newSection.id);
      result.push(newSection);
      add(s.id, 0);
    }
  }
  add(null, 0);
  return result;
}

/** Get top-level sections (H1) and nested H2s, in display order */
export function getOrderedSections(sections: ProfileSection[]): ProfileSection[] {
  const byParent = new Map<string | null, ProfileSection[]>();
  for (const s of sections) {
    const parent = s.parentId ?? null;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push(s);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.order - b.order);
  }
  const result: ProfileSection[] = [];
  function add(parentId: string | null) {
    const children = byParent.get(parentId) ?? [];
    for (const s of children) {
      result.push(s);
      add(s.id);
    }
  }
  add(null);
  return result;
}

/** Escape a string for use in double-quoted DSL (backslash for " and \n) */
function escapeQuotedString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export interface GenerateProfilesScriptOptions {
  compact?: boolean;
  characterName?: string;
  /** When input is empty: "characters" = show character message, "template" = show template message */
  source?: "characters" | "template";
  /** Custom data types for template layout; output first in script when present */
  customDataTypes?: CustomDataType[];
  /** Stored @builtin lines (e.g. @builtin number: [0, 120, 1]); emit in # Data types when present */
  builtinDataTypes?: string[];
}

/**
 * Generate profile script in the robust DSL format.
 * v1: one-way code generation (UI → script). No parsing.
 *
 * DSL keywords: h1/h2/h3/h4, note, attributes, image.
 * Extensible: future phases can add @options, arrays (e.g. key: [a, b, c]).
 */
export function generateChartsScript(
  input: CharacterEntity[] | ProfileSection[],
  options: GenerateProfilesScriptOptions = {}
): string {
  const compact = options.compact ?? false;
  const customDataTypes = options.customDataTypes ?? [];
  const storedBuiltinLines = options.builtinDataTypes ?? [];

  function getSectionDepth(sections: ProfileSection[], sectionId: string): number {
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec || sec.parentId == null) return 0;
    return 1 + getSectionDepth(sections, sec.parentId);
  }

  function renderSections(sections: ProfileSection[], depthBase: number) {
    const lines: string[] = [];
    const ordered = getOrderedSections(sections);

    for (const sec of ordered) {
      const depth = getSectionDepth(sections, sec.id);
      const indent = "  ".repeat(depthBase + depth);
      const blockIndent = "  ".repeat(depthBase + depth + 1);
      const level = (sec.headingLevel ?? "h1") as SectionHeadingLevel;
      const label = sec.label?.trim() || "Section";

      if (compact) {
        const parts: string[] = [];
        for (const block of sec.contentBlocks ?? []) {
          if (block.type === "note" && block.content.trim()) {
            parts.push(block.content.trim().replace(/\n/g, " "));
          }
          if (block.type === "attributes" && Object.keys(block.keyValuePairs ?? {}).length > 0) {
            const attrStr = (block.attributeOrder ?? Object.keys(block.keyValuePairs ?? {}))
              .filter((k) => k in (block.keyValuePairs ?? {}))
              .map((k) => `${k}: "${escapeQuotedString((block.keyValuePairs ?? {})[k] ?? "")}"`)
              .join(", ");
            parts.push(attrStr);
          }
          if (block.type === "image") {
            parts.push(block.label ? `[image: ${block.label}]` : "[image]");
          }
        }
        lines.push(`${indent}${level} "${label}" ${parts.length > 0 ? "| " + parts.join(" | ") : ""}`);
      } else {
        lines.push(`${indent}${level} "${label}"`);
        for (const block of sec.contentBlocks ?? []) {
          if (block.type === "note") {
            const content = block.content ?? "";
            const escaped = escapeQuotedString(content);
            lines.push(`${blockIndent}note "${escaped}"`);
          }
          if (block.type === "attributes") {
            const pairs = block.keyValuePairs ?? {};
            const order = block.attributeOrder ?? Object.keys(pairs);
            const meta = block.attributeMeta ?? {};
            const entries = order.filter((k) => k in pairs);
            lines.push(`${blockIndent}attributes`);
            if (entries.length === 0) {
              lines.push(`${blockIndent}  —`);
            } else {
              for (const [key, value] of entries.map((k) => [k, pairs[k]])) {
                const m = meta[key];
                const theType = m?.type ?? "text";
                let typeAnno = "";
                if (theType === "custom" && m?.customTypeId) {
                  const tagName = customDataTypes.find((t) => t.id === m.customTypeId)?.name ?? "text";
                  const allowStr = m?.allowCustom != null ? ` allowCustom=${m.allowCustom}` : "";
                  typeAnno = ` | @${tagName}${allowStr}`;
                } else if (theType !== "text") {
                  const builtinPrefix = `@builtin:${theType}`;
                  let configStr = "";
                  if (theType === "number" || theType === "numberScroll") {
                    const min = m?.min,
                      max = m?.max,
                      step = m?.step;
                    const hasNum = (n: number | undefined) =>
                      n != null && !Number.isNaN(n);
                    if (hasNum(min) || hasNum(max) || hasNum(step)) {
                      configStr = ` [${min ?? ""}, ${max ?? ""}, ${step ?? ""}]`;
                    }
                  }
                  typeAnno = ` | ${builtinPrefix}${configStr}`;
                }
                lines.push(`${blockIndent}  ${key}: "${escapeQuotedString(value)}"${typeAnno}`);
              }
            }
          }
          if (block.type === "image") {
            const imgLabel = block.label?.trim() || "";
            lines.push(`${blockIndent}image "${escapeQuotedString(imgLabel)}"`);
          }
        }
      }
    }
    return lines;
  }

  /** Collect built-in type definitions from sections (used when generating template script) */
  function collectBuiltinDataTypes(sections: ProfileSection[]): string[] {
    const builtinLines: string[] = [];
    const numConfigs = new Set<string>();

    function hasNum(n: number | undefined): boolean {
      return n != null && !Number.isNaN(n);
    }

    for (const sec of sections) {
      for (const block of sec.contentBlocks ?? []) {
        if (block.type !== "attributes") continue;
        const meta = block.attributeMeta ?? {};
        for (const m of Object.values(meta)) {
          if (!m) continue;
          const t = m.type ?? "text";
          if (t === "number" || t === "numberScroll") {
            if (hasNum(m.min) || hasNum(m.max) || hasNum(m.step)) {
              const key = `${t}:${m.min ?? ""},${m.max ?? ""},${m.step ?? ""}`;
              if (!numConfigs.has(key)) {
                numConfigs.add(key);
                builtinLines.push(`@builtin ${t}: [${m.min ?? ""}, ${m.max ?? ""}, ${m.step ?? ""}]`);
              }
            }
          }
        }
      }
    }
    return builtinLines;
  }

  const lines: string[] = ["@charts", ""];

  const sections =
    Array.isArray(input) && input.length > 0
      ? "sections" in input[0]
        ? (input as CharacterEntity[]).flatMap((c) => c.sections ?? [])
        : (input as ProfileSection[])
      : [];
  const collectedBuiltins = collectBuiltinDataTypes(sections);
  const mergedBuiltinLines = storedBuiltinLines.length > 0
    ? [...storedBuiltinLines, ...collectedBuiltins.filter((l) => !storedBuiltinLines.includes(l))]
    : collectedBuiltins;
  const hasDataTypes = customDataTypes.length > 0 || mergedBuiltinLines.length > 0;

  if (hasDataTypes) {
    lines.push("# Data types");
    for (const line of mergedBuiltinLines) {
      lines.push(line);
    }
    for (const t of customDataTypes) {
      const opts =
        t.options.length > 0
          ? t.options.map((o) => `"${escapeQuotedString(o)}"`).join(", ")
          : "";
      lines.push(`${t.name}: [${opts}]`);
    }
    lines.push("");
  }

  if (Array.isArray(input) && input.length > 0) {
    const first = input[0];
    if ("name" in first && "sections" in first) {
      const chars = input as CharacterEntity[];
      for (const char of chars) {
        const name = char.name.trim() || "Unnamed";
        lines.push(`[${name}] {`);
        const sections = char.sections ?? [];
        lines.push(...renderSections(sections, 1));
        lines.push("}");
        lines.push("");
      }
    } else {
      const secs = input as ProfileSection[];
      const name = options.characterName ?? "New Layout";
      lines.push(`[${name}] {`);
      lines.push(...renderSections(secs, 1));
      lines.push("}");
    }
  } else {
    const src = options.source ?? "characters";
    lines.push(
      src === "template"
        ? "(No sections yet. Add sections to define the layout.)"
        : "(No characters yet. Add characters in the Entities panel.)"
    );
  }

  return lines.join("\n").trimEnd();
}

export const useChartsStore = create<ChartsStore>(
  instrument("charts", (set, get) => ({
    activeProjectId: null,
    characters: [],
    selectedCharacterId: null,
    comparisonCharacterId: null,
    chartLayoutMode: "fill" as ChartLayoutMode,
    editLayoutDirty: false,
    editLayoutDraftSections: [],
    editLayoutDraftDataTypes: [],
    editingTemplateId: null,
    createLayoutDirty: false,
    createLayoutDraftSections: [],
    createLayoutDraftDataTypes: [],
    createLayoutDraftBuiltinDataTypes: [],
    chartSectionLayoutMode: "list" as ChartSectionLayoutMode,
    displayMode: "charts" as ChartsDisplayMode,
    folders: [] as ChartsFolderRecord[],
    documents: [] as ChartsDocumentRecord[],
    activeFolderId: null as string | null,
    activeDocumentId: null as string | null,
    dirtyDocumentIds: [] as string[],

    setDisplayMode: (mode) => {
      const projectId = get().activeProjectId;
      if (projectId) saveDisplayModeToStorage(projectId, mode);
      set({ displayMode: mode });
    },

    setDirtyDocumentIds: (ids) => set({ dirtyDocumentIds: ids }),

    setActiveFolderId: (folderId) => {
      const projectId = get().activeProjectId;
      if (projectId) saveActiveFolderIdToStorage(projectId, folderId);
      set({ activeFolderId: folderId });
    },

    setActiveDocumentId: (docId) => set({ activeDocumentId: docId }),

    ensureDefaultFolders: () => {
      const projectId = get().activeProjectId;
      if (!projectId) return;
      const existing = loadFoldersFromStorage(projectId);
      const { folders, changed } = ensureDefaultFolders(existing);
      if (!changed) {
        if (get().folders.length === 0) set({ folders });
        return;
      }
      saveFoldersToStorage(projectId, folders);
      set({ folders });
    },

    ensureDocumentsForEntities: () => {
      const projectId = get().activeProjectId;
      if (!projectId) return;
      const folders = loadFoldersFromStorage(projectId);
      const characters = loadFromStorage(projectId);
      const templates = loadTemplatesFromStorage(projectId);
      const existingDocs = loadDocumentsFromStorage(projectId);
      const { documents, changed } = ensureDocumentsForEntities(
        existingDocs,
        folders,
        characters,
        templates
      );
      if (!changed) {
        if (get().documents.length === 0) set({ documents });
        return;
      }
      saveDocumentsToStorage(projectId, documents);
      set({ documents });
    },

    getDocumentDisplayContent: (docId) => {
      const s = get();
      if (s.dirtyDocumentIds.includes(docId)) {
        const doc = s.documents.find((d) => d.id === docId);
        return doc?.content ?? "";
      }
      const doc = s.documents.find((d) => d.id === docId);
      if (!doc) return "";
      return generateChartDocumentDisplayContent(
        doc,
        s.characters,
        loadTemplatesFromStorage(s.activeProjectId ?? "")
      );
    },

    getDocumentForCharacter: (characterId) => {
      return get().documents.find((d) => d.characterId === characterId) ?? null;
    },

    getDocumentForTemplate: (templateId) => {
      return get().documents.find((d) => d.templateId === templateId) ?? null;
    },

    applyChartsDocumentEdits: (edits) => {
      const projectId = get().activeProjectId;
      if (!projectId) return { ok: false, errors: ["No project loaded."] };
      const errors: string[] = [];
      let characters = loadFromStorage(projectId);
      let templates = loadTemplatesFromStorage(projectId);
      let documents = loadDocumentsFromStorage(projectId);

      for (const { docId, content } of edits) {
        const doc = documents.find((d) => d.id === docId);
        if (!doc) {
          errors.push(`Document not found: ${docId}`);
          continue;
        }
        const parsed = parseChartsScript(content);
        if (!parsed.ok) {
          errors.push(
            parsed.error.line != null
              ? `Line ${parsed.error.line}: ${parsed.error.message}`
              : parsed.error.message
          );
          continue;
        }

        if (doc.kind === "chart" && doc.characterId) {
          const parsedChar = parsed.characters[0];
          if (!parsedChar) {
            errors.push(`Chart file "${doc.name}" must contain one character block.`);
            continue;
          }
          characters = characters.map((c) =>
            c.id === doc.characterId
              ? {
                  ...c,
                  name: parsedChar.name || c.name,
                  sections: parsedChar.sections ?? [],
                  customDataTypes: parsed.customDataTypes ?? c.customDataTypes,
                }
              : c
          );
        } else if (doc.kind === "layout" && doc.templateId) {
          const parsedChar = parsed.characters[0];
          const sections = parsedChar?.sections ?? [];
          templates = templates.map((t) =>
            t.id === doc.templateId
              ? {
                  ...t,
                  name: parsedChar?.name || t.name,
                  sections: sectionsToTemplateFormat(sections),
                  customDataTypes: parsed.customDataTypes ?? t.customDataTypes,
                  builtinDataTypes: parsed.builtinDataTypes ?? t.builtinDataTypes,
                }
              : t
          );
          const updatedTemplate = templates.find((t) => t.id === doc.templateId);
          if (updatedTemplate) {
            const linkedChars = characters.filter(
              (c) => (c.linkedTemplateId ?? null) === doc.templateId
            );
            if (linkedChars.length > 0) {
              characters = characters.map((c) => {
                if ((c.linkedTemplateId ?? null) !== doc.templateId) return c;
                const nextSections = applyTemplateSections(
                  updatedTemplate.sections,
                  c.sections ?? [],
                  "merge"
                );
                return {
                  ...c,
                  sections: nextSections,
                  customDataTypes: updatedTemplate.customDataTypes ?? [],
                };
              });
            }
          }
        }

        documents = documents.map((d) =>
          d.id === docId ? { ...d, content, updatedAt: Date.now() } : d
        );
      }

      if (errors.length > 0) return { ok: false, errors };

      saveToStorage(projectId, characters);
      saveTemplatesToStorage(projectId, templates);
      saveDocumentsToStorage(projectId, documents);
      set({
        characters,
        documents,
        dirtyDocumentIds: get().dirtyDocumentIds.filter(
          (id) => !edits.some((e) => e.docId === id)
        ),
      });
      return { ok: true };
    },

    updateTemplateSections: (projectId, templateId, sections, customDataTypes = [], builtinDataTypes = []) => {
      const templates = loadTemplatesFromStorage(projectId);
      const template = templates.find((t) => t.id === templateId);
      if (!template) return false;
      const templateSections = sectionsToTemplateFormat(sections);
      const updatedTemplate = {
        ...template,
        sections: templateSections,
        customDataTypes,
        builtinDataTypes,
      };
      const updatedTemplates = templates.map((t) =>
        t.id === templateId ? updatedTemplate : t
      );
      saveTemplatesToStorage(projectId, updatedTemplates);

      const chars = loadFromStorage(projectId);
      const linkedChars = chars.filter((c) => (c.linkedTemplateId ?? null) === templateId);
      if (linkedChars.length > 0) {
        const nextChars = chars.map((c) => {
          if ((c.linkedTemplateId ?? null) !== templateId) return c;
          const nextSections = applyTemplateSections(
            updatedTemplate.sections,
            c.sections ?? [],
            "merge"
          );
          return { ...c, sections: nextSections, customDataTypes: updatedTemplate.customDataTypes ?? [] };
        });
        saveToStorage(projectId, nextChars);
        if (get().activeProjectId === projectId) set({ characters: nextChars });
      }
      return true;
    },

    createFolder: (name, kind) => {
      const projectId = get().activeProjectId;
      if (!projectId) return "";
      const folders = loadFoldersFromStorage(projectId);
      const siblings = folders.filter((f) => f.kind === kind);
      const folder: ChartsFolderRecord = {
        id: generateId(),
        name: name.trim() || (kind === "chart" ? "Charts" : "Layouts"),
        kind,
        sortOrder: nextSortOrder(siblings),
      };
      const next = [...folders, folder];
      saveFoldersToStorage(projectId, next);
      set({ folders: next, activeFolderId: folder.id });
      return folder.id;
    },

    renameFolder: (folderId, name) => {
      const projectId = get().activeProjectId;
      if (!projectId) return;
      const trimmed = name.trim() || "Folder";
      const folders = loadFoldersFromStorage(projectId).map((f) =>
        f.id === folderId ? { ...f, name: trimmed } : f
      );
      saveFoldersToStorage(projectId, folders);
      set({ folders });
    },

    deleteFolderCascade: (folderId) => {
      const projectId = get().activeProjectId;
      if (!projectId) return { ok: false, reason: "lastOfKind" as const };
      const folders = loadFoldersFromStorage(projectId);
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return { ok: true };
      const sameKind = folders.filter((f) => f.kind === folder.kind);
      if (sameKind.length <= 1) return { ok: false, reason: "lastOfKind" };
      const nextFolders = folders.filter((f) => f.id !== folderId);
      const nextDocs = loadDocumentsFromStorage(projectId).filter((d) => d.folderId !== folderId);
      saveFoldersToStorage(projectId, nextFolders);
      saveDocumentsToStorage(projectId, nextDocs);
      set({
        folders: nextFolders,
        documents: nextDocs,
        activeFolderId: get().activeFolderId === folderId ? null : get().activeFolderId,
      });
      return { ok: true };
    },

    createDocument: (kind, folderId, name) => {
      const projectId = get().activeProjectId;
      if (!projectId) return "";
      const folders = loadFoldersFromStorage(projectId);
      const targetFolder =
        folders.find((f) => f.id === folderId) ??
        sortByOrder(folders.filter((f) => f.kind === kind))[0];
      if (!targetFolder || targetFolder.kind !== kind) return "";

      const id = generateId();
      const now = Date.now();
      const docName = name?.trim() || (kind === "chart" ? "Untitled Chart" : "Untitled Layout");
      const doc: ChartsDocumentRecord = {
        id,
        name: docName,
        content:
          kind === "chart"
            ? defaultChartDocumentContent(docName)
            : generateChartsScript([], { source: "template", characterName: docName }),
        folderId: targetFolder.id,
        kind,
        updatedAt: now,
      };
      const next = [...loadDocumentsFromStorage(projectId), doc];
      saveDocumentsToStorage(projectId, next);
      set({ documents: next, activeDocumentId: id });
      return id;
    },

    renameDocument: (docId, name) => {
      const projectId = get().activeProjectId;
      if (!projectId) return;
      const trimmed = name.trim() || "Untitled";
      const documents = loadDocumentsFromStorage(projectId).map((d) =>
        d.id === docId ? { ...d, name: trimmed, autoNamed: false, updatedAt: Date.now() } : d
      );
      saveDocumentsToStorage(projectId, documents);
      set({ documents });
    },

    deleteDocument: (docId) => {
      const projectId = get().activeProjectId;
      if (!projectId) return;
      const doc = loadDocumentsFromStorage(projectId).find((d) => d.id === docId);
      if (!doc) return;
      if (doc.characterId) {
        get().removeCharacter(projectId, doc.characterId);
        return;
      }
      if (doc.templateId) {
        get().deleteTemplate(projectId, doc.templateId);
        return;
      }
      const next = loadDocumentsFromStorage(projectId).filter((d) => d.id !== docId);
      saveDocumentsToStorage(projectId, next);
      set({
        documents: next,
        activeDocumentId: get().activeDocumentId === docId ? null : get().activeDocumentId,
      });
    },

    moveDocument: (docId, folderId) => {
      const projectId = get().activeProjectId;
      if (!projectId) return { ok: false, reason: "kindMismatch" as const };
      const folders = loadFoldersFromStorage(projectId);
      const folder = folders.find((f) => f.id === folderId);
      const doc = loadDocumentsFromStorage(projectId).find((d) => d.id === docId);
      if (!folder || !doc) return { ok: true };
      if (doc.kind !== folder.kind) return { ok: false, reason: "kindMismatch" };
      const next = loadDocumentsFromStorage(projectId).map((d) =>
        d.id === docId ? { ...d, folderId, updatedAt: Date.now() } : d
      );
      saveDocumentsToStorage(projectId, next);
      set({ documents: next });
      return { ok: true };
    },

    setSelectedCharacter: (characterId, shiftKey) => {
      const s = get();
      const projectId = s.activeProjectId;
      const runSync = (cid: string | null) => {
        if (projectId && cid) get().syncLinkedCharacterWithTemplate(projectId, cid);
      };
      if (shiftKey) {
        if (characterId == null) return;
        if (characterId === s.selectedCharacterId || characterId === s.comparisonCharacterId) {
          if (characterId === s.comparisonCharacterId) {
            set({ comparisonCharacterId: null });
          } else if (s.comparisonCharacterId) {
            set({ selectedCharacterId: s.comparisonCharacterId, comparisonCharacterId: null });
          } else {
            set({ selectedCharacterId: null });
          }
          return;
        }
        if (s.comparisonCharacterId) {
          set({
            comparisonCharacterId: characterId,
            chartLayoutMode: "fill" as ChartLayoutMode,
            editLayoutDirty: false,
            editLayoutDraftSections: [],
          });
          runSync(characterId);
        } else if (s.selectedCharacterId && s.selectedCharacterId !== characterId) {
          set({
            comparisonCharacterId: characterId,
            chartLayoutMode: "fill" as ChartLayoutMode,
            editLayoutDirty: false,
            editLayoutDraftSections: [],
          });
          runSync(characterId);
        } else {
          set({ selectedCharacterId: characterId, comparisonCharacterId: null });
          runSync(characterId);
        }
        return;
      }
      set({
        selectedCharacterId: characterId,
        comparisonCharacterId: null,
        chartLayoutMode: "fill" as ChartLayoutMode,
        editLayoutDirty: false,
      });
      runSync(characterId ?? null);
    },
    exitComparison: () => set({ comparisonCharacterId: null }),

    setChartLayoutMode: (mode) => {
      const prev = get().chartLayoutMode;
      const s = get();
      const updates: Record<string, unknown> = {
        chartLayoutMode: mode,
        editLayoutDirty: mode !== "edit" ? false : s.editLayoutDirty,
      };
      if (mode === "createLayout") {
        const alreadyEditingTemplate = prev === "createLayout" && s.editingTemplateId != null;
        if (!alreadyEditingTemplate) {
          updates.editingTemplateId = null;
          updates.createLayoutDraftSections = [] as ProfileSection[];
          updates.createLayoutDraftDataTypes = [] as CustomDataType[];
          updates.createLayoutDraftBuiltinDataTypes = [] as string[];
          updates.createLayoutDirty = false;
        }
      } else {
        updates.editingTemplateId = null;
        updates.createLayoutDraftSections = s.createLayoutDraftSections;
        updates.createLayoutDirty = false;
      }
      if (mode === "edit") {
        const charId = get().selectedCharacterId;
        const chars = get().characters;
        const char = chars.find((c) => c.id === charId);
        const raw = char?.sections ?? [];
        updates.editLayoutDraftSections = raw.length > 0 ? JSON.parse(JSON.stringify(raw)) : [];
        updates.editLayoutDraftDataTypes = JSON.parse(JSON.stringify(char?.customDataTypes ?? []));
      } else if (prev === "edit") {
        updates.editLayoutDraftSections = [];
        updates.editLayoutDraftDataTypes = [];
      }
      set(updates);
    },

    setEditLayoutDirty: (dirty) => {
      set({ editLayoutDirty: dirty });
    },

    setEditLayoutDraftSections: (sections) => {
      set({ editLayoutDraftSections: sections, editLayoutDirty: true });
    },

    setEditLayoutDraftDataTypes: (types) => {
      set({ editLayoutDraftDataTypes: types, editLayoutDirty: true });
    },

    applyEditLayoutDraftToCharacter: (projectId, characterId) => {
      const draft = get().editLayoutDraftSections;
      const draftDataTypes = get().editLayoutDraftDataTypes;
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) =>
        c.id === characterId ? { ...c, sections: draft, customDataTypes: draftDataTypes } : c
      );
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) {
        set({
          characters: chars,
          chartLayoutMode: "fill" as ChartLayoutMode,
          editLayoutDirty: false,
          editLayoutDraftSections: [],
          editLayoutDraftDataTypes: [],
        });
      } else {
        set({ editLayoutDirty: false, editLayoutDraftSections: [], editLayoutDraftDataTypes: [] });
      }
      return true;
    },

    setCreateLayoutDraftSections: (sections) => {
      set({ createLayoutDraftSections: sections, createLayoutDirty: true });
    },

    setCreateLayoutDraftDataTypes: (types) => {
      set({ createLayoutDraftDataTypes: types, createLayoutDirty: true });
    },

    setCreateLayoutDraftBuiltinDataTypes: (lines) => {
      set({ createLayoutDraftBuiltinDataTypes: lines, createLayoutDirty: true });
    },

    setChartSectionLayoutMode: (mode) => {
      const projectId = get().activeProjectId;
      if (projectId) saveChartSectionLayoutMode(projectId, mode);
      set({ chartSectionLayoutMode: mode });
    },

    setActiveProject: (projectId) => {
      const layoutMode = projectId ? loadChartSectionLayoutMode(projectId) : "list";
      set({
        activeProjectId: projectId,
        selectedCharacterId: null,
        comparisonCharacterId: null,
        chartSectionLayoutMode: layoutMode,
        displayMode: projectId ? loadDisplayModeFromStorage(projectId) : "charts",
        folders: projectId ? loadFoldersFromStorage(projectId) : [],
        documents: projectId ? loadDocumentsFromStorage(projectId) : [],
        activeFolderId: projectId ? loadActiveFolderIdFromStorage(projectId) : null,
        activeDocumentId: null,
        dirtyDocumentIds: [],
      });
      if (projectId) {
        get().loadCharacters(projectId);
      } else {
        set({ characters: [] });
      }
    },

    loadCharacters: (projectId) => {
      void (async () => {
        if (await isFileBackedProject(projectId)) {
          try {
            const payload = await loadModulePayloadFromFile(projectId);
            const normalized = normalizeChartsPayload(payload);
            if (normalized) {
              try {
                localStorage.setItem(CHARTS_STORAGE_KEY(projectId), JSON.stringify(normalized.characters));
                localStorage.setItem(TEMPLATES_STORAGE_KEY(projectId), JSON.stringify(normalized.templates));
                if (normalized.chartSectionLayout) {
                  localStorage.setItem(CHART_SECTION_LAYOUT_KEY(projectId), normalized.chartSectionLayout);
                }
                if (normalized.folders) {
                  localStorage.setItem(FOLDERS_STORAGE_KEY(projectId), JSON.stringify(normalized.folders));
                }
                if (normalized.documents) {
                  localStorage.setItem(DOCUMENTS_STORAGE_KEY(projectId), JSON.stringify(normalized.documents));
                }
                if (normalized.displayMode) {
                  localStorage.setItem(`synapse-iwe:charts:displayMode:${projectId}`, normalized.displayMode);
                }
                if (normalized.activeFolderId) {
                  localStorage.setItem(`synapse-iwe:charts:activeFolderId:${projectId}`, normalized.activeFolderId);
                }
              } catch { /* mirror best-effort */ }
              set({
                characters: normalized.characters,
                activeProjectId: projectId,
                chartSectionLayoutMode: normalized.chartSectionLayout ?? "list",
                displayMode: normalized.displayMode === "text" ? "text" : "charts",
                folders: normalized.folders ?? [],
                documents: normalized.documents ?? [],
                activeFolderId: normalized.activeFolderId ?? null,
              });
              get().ensureDefaultFolders();
              get().ensureDocumentsForEntities();
              return;
            }
          } catch (e) {
            console.warn("[ChartsStore] File load failed, using localStorage:", e);
          }
        }
        const chars = loadFromStorage(projectId);
        const layoutMode = loadChartSectionLayoutMode(projectId);
        set({
          characters: chars,
          activeProjectId: projectId,
          chartSectionLayoutMode: layoutMode,
          displayMode: loadDisplayModeFromStorage(projectId),
          folders: loadFoldersFromStorage(projectId),
          documents: loadDocumentsFromStorage(projectId),
          activeFolderId: loadActiveFolderIdFromStorage(projectId),
        });
        get().ensureDefaultFolders();
        get().ensureDocumentsForEntities();
      })();
    },

    addCharacter: (projectId, name) => {
      const existing = loadFromStorage(projectId);
      const defaultName = (() => {
        const re = /^Chart\s+(\d+)$/i;
        let maxN = 0;
        for (const c of existing) {
          const m = c.name.trim().match(re);
          if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
        }
        return `Chart ${maxN + 1}`;
      })();
      const finalName = (name?.trim() && name !== "Chart") ? name.trim() : defaultName;
      const id = generateId();
      const entity: CharacterEntity = { id, name: finalName, sections: [], linkedTemplateId: null };
      const chars = [...existing, entity];
      saveToStorage(projectId, chars);

      get().ensureDefaultFolders();
      const folders = loadFoldersFromStorage(projectId);
      const chartFolder = sortByOrder(folders.filter((f) => f.kind === "chart"))[0];
      if (chartFolder) {
        const docs = [...loadDocumentsFromStorage(projectId), createChartDocumentRecord(entity, chartFolder.id)];
        saveDocumentsToStorage(projectId, docs);
        if (get().activeProjectId === projectId) set({ documents: docs });
      }

      if (get().activeProjectId === projectId) {
        set({
          characters: chars,
          selectedCharacterId: id,
          chartLayoutMode: "fill" as ChartLayoutMode,
        });
      }
      return id;
    },

    removeCharacter: (projectId, characterId) => {
      const existing = loadFromStorage(projectId);
      const chars = existing.filter((c) => c.id !== characterId);
      saveToStorage(projectId, chars);
      const docs = loadDocumentsFromStorage(projectId).filter((d) => d.characterId !== characterId);
      saveDocumentsToStorage(projectId, docs);
      const s = get();
      if (s.activeProjectId === projectId) {
        const removingPrimary = s.selectedCharacterId === characterId;
        const removingComparison = s.comparisonCharacterId === characterId;
        let nextSelected = s.selectedCharacterId;
        let nextComparison: string | null = s.comparisonCharacterId;
        if (removingPrimary && removingComparison) {
          nextSelected = null;
          nextComparison = null;
        } else if (removingPrimary) {
          nextSelected = s.comparisonCharacterId;
          nextComparison = null;
        } else if (removingComparison) {
          nextComparison = null;
        }
        if (nextSelected && !chars.some((c) => c.id === nextSelected)) nextSelected = null;
        if (nextComparison && !chars.some((c) => c.id === nextComparison)) nextComparison = null;
        set({
          characters: chars,
          documents: docs,
          selectedCharacterId: nextSelected,
          comparisonCharacterId: nextComparison,
          ...(removingPrimary && s.chartLayoutMode === "edit"
            ? { chartLayoutMode: "fill" as ChartLayoutMode, editLayoutDirty: false, editLayoutDraftSections: [] }
            : {}),
        });
      }
    },

    updateCharacterName: (projectId, characterId, name) => {
      const trimmed = name.trim() || "Chart";
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) =>
        c.id === characterId ? { ...c, name: trimmed } : c
      );
      saveToStorage(projectId, chars);
      const char = chars.find((c) => c.id === characterId);
      const docs = loadDocumentsFromStorage(projectId).map((d) => {
        if (d.characterId !== characterId) return d;
        if (d.autoNamed && char) return { ...d, name: char.name, updatedAt: Date.now() };
        return d;
      });
      saveDocumentsToStorage(projectId, docs);
      if (get().activeProjectId === projectId) set({ characters: chars, documents: docs });
    },

    addSection: (projectId, characterId, parentId = null, label = "New section") => {
      const sectionId = generateId();
      const existing = loadFromStorage(projectId);
      const NEXT_LEVEL: Record<SectionHeadingLevel, SectionHeadingLevel | null> = {
        h1: "h2",
        h2: "h3",
        h3: "h4",
        h4: null,
      };
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const allSections = c.sections ?? [];
        const siblings = allSections.filter((s) => (s.parentId ?? null) === parentId);
        const maxOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
        let headingLevel: SectionHeadingLevel = "h1";
        if (parentId) {
          const parent = allSections.find((s) => s.id === parentId);
          const next = parent ? NEXT_LEVEL[parent.headingLevel ?? "h1"] : "h2";
          if (!next) return c;
          headingLevel = next;
        }
        const section: ProfileSection = {
          id: sectionId,
          label: label.trim() || "New section",
          headingLevel,
          parentId,
          contentBlocks: [],
          order: maxOrder,
        };
        return { ...c, sections: [...allSections, section] };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
      return sectionId;
    },

    updateSectionLabel: (projectId, characterId, sectionId, label) => {
      const trimmed = label.trim() || "New section";
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) =>
          s.id === sectionId ? { ...s, label: trimmed } : s
        );
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    updateSectionHeadingLevel: (projectId, characterId, sectionId, level) => {
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) =>
          s.id === sectionId ? { ...s, headingLevel: level } : s
        );
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    removeSection: (projectId, characterId, sectionId) => {
      const existing = loadFromStorage(projectId);
      function collectDescendantIds(sects: ProfileSection[], sid: string): Set<string> {
        const ids = new Set<string>([sid]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const s of sects) {
            if (s.parentId && ids.has(s.parentId) && !ids.has(s.id)) {
              ids.add(s.id);
              changed = true;
            }
          }
        }
        return ids;
      }
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sects = c.sections ?? [];
        const toRemove = collectDescendantIds(sects, sectionId);
        const sections = sects.filter((s) => !toRemove.has(s.id));
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    reorderSections: (projectId, characterId, parentId, fromIndex, toIndex) => {
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const siblings = (c.sections ?? []).filter((s) => (s.parentId ?? null) === parentId);
        const sorted = [...siblings].sort((a, b) => a.order - b.order);
        const [removed] = sorted.splice(fromIndex, 1);
        if (!removed) return c;
        sorted.splice(toIndex, 0, removed);
        const orderById = Object.fromEntries(sorted.map((s, i) => [s.id, i]));
        const sections = (c.sections ?? []).map((s) =>
          s.id in orderById ? { ...s, order: orderById[s.id] } : s
        );
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    moveSectionTo: (projectId, characterId, sectionId, targetParentId, targetSectionId) => {
      const NEXT_LEVEL: Record<SectionHeadingLevel, SectionHeadingLevel | null> = {
        h1: "h2",
        h2: "h3",
        h3: "h4",
        h4: null,
      };
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const allSections = c.sections ?? [];
        const movingSection = allSections.find((s) => s.id === sectionId);
        const targetSection = allSections.find((s) => s.id === targetSectionId);
        if (!movingSection || !targetSection) return c;
        const targetSiblings = allSections.filter((s) => (s.parentId ?? null) === targetParentId);
        const sorted = [...targetSiblings].sort((a, b) => a.order - b.order);
        const toIndex = sorted.findIndex((s) => s.id === targetSectionId);
        if (toIndex < 0) return c;
        const needNest = (movingSection.parentId ?? null) !== targetParentId;
        let sections = [...allSections];
        if (needNest) {
          const parent = targetParentId ? allSections.find((s) => s.id === targetParentId) : null;
          const childLevel: SectionHeadingLevel = targetParentId && parent
            ? (NEXT_LEVEL[parent.headingLevel ?? "h1"] ?? "h2")
            : "h1";
          sections = sections.map((s) =>
            s.id === sectionId ? { ...s, parentId: targetParentId, headingLevel: childLevel } : s
          );
        }
        const newSiblings = sections.filter((s) => (s.parentId ?? null) === targetParentId);
        const newSorted = [...newSiblings].sort((a, b) => a.order - b.order);
        const fromIndex = newSorted.findIndex((s) => s.id === sectionId);
        if (fromIndex < 0 || fromIndex === toIndex) return { ...c, sections };
        const [removed] = newSorted.splice(fromIndex, 1);
        newSorted.splice(toIndex, 0, removed);
        const orderById = Object.fromEntries(newSorted.map((s, i) => [s.id, i]));
        sections = sections.map((s) => (s.id in orderById ? { ...s, order: orderById[s.id] } : s));
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    nestSection: (projectId, characterId, sectionId, newParentId) => {
      const NEXT_LEVEL: Record<SectionHeadingLevel, SectionHeadingLevel | null> = {
        h1: "h2",
        h2: "h3",
        h3: "h4",
        h4: null,
      };
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const allSections = c.sections ?? [];
        const parent = newParentId ? allSections.find((s) => s.id === newParentId) : null;
        const childLevel: SectionHeadingLevel = newParentId && parent
          ? (NEXT_LEVEL[parent.headingLevel ?? "h1"] ?? "h2")
          : "h1";
        const sections = allSections.map((s) =>
          s.id === sectionId ? { ...s, parentId: newParentId, headingLevel: childLevel } : s
        );
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    addContentBlock: (projectId, characterId, sectionId, blockType) => {
      const blockId = generateId();
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) => {
          if (s.id !== sectionId) return s;
          let block: ContentBlock;
          if (blockType === "note") {
            block = { type: "note", id: blockId, content: "" };
          } else if (blockType === "attributes") {
            block = { type: "attributes", id: blockId, keyValuePairs: { "Attribute 1": "" }, attributeOrder: ["Attribute 1"] };
          } else {
            block = { type: "image", id: blockId };
          }
          return { ...s, contentBlocks: [...(s.contentBlocks ?? []), block] };
        });
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
      return blockId;
    },

    addAttributeToSection: (projectId, characterId, sectionId) => {
      const existing = loadFromStorage(projectId);
      const char = existing.find((c) => c.id === characterId);
      if (!char) return;
      const section = (char.sections ?? []).find((s) => s.id === sectionId);
      if (!section) return;
      const attrsBlocks = (section.contentBlocks ?? []).filter((b): b is AttributeBlock => b.type === "attributes");
      const totalAttrCount = attrsBlocks.reduce((sum, b) => sum + (b.attributeOrder ?? Object.keys(b.keyValuePairs ?? {})).length, 0);
      const nextKey = `Attribute ${totalAttrCount + 1}`;

      if (attrsBlocks.length === 0) {
        get().addContentBlock(projectId, characterId, sectionId, "attributes");
      } else {
        const lastBlock = attrsBlocks[attrsBlocks.length - 1];
        get().addAttributeKey(projectId, characterId, sectionId, lastBlock.id, nextKey);
      }
    },

    updateContentBlock: (projectId, characterId, sectionId, blockId, updates) => {
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) => {
          if (s.id !== sectionId) return s;
          const blocks = (s.contentBlocks ?? []).map((b) => {
            if (b.id !== blockId) return b;
            const merged = { ...b, ...updates } as ContentBlock;
            return merged;
          });
          return { ...s, contentBlocks: blocks };
        });
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    removeContentBlock: (projectId, characterId, sectionId, blockId) => {
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) => {
          if (s.id !== sectionId) return s;
          const blocks = (s.contentBlocks ?? []).filter((b) => b.id !== blockId);
          return { ...s, contentBlocks: blocks };
        });
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    reorderContentBlocks: (projectId, characterId, sectionId, fromIndex, toIndex) => {
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) => {
          if (s.id !== sectionId) return s;
          const blocks = [...(s.contentBlocks ?? [])];
          const [removed] = blocks.splice(fromIndex, 1);
          if (!removed) return s;
          blocks.splice(toIndex, 0, removed);
          return { ...s, contentBlocks: blocks };
        });
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    addAttributeKey: (projectId, characterId, sectionId, blockId, key = "New attribute", value = "") => {
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) => {
          if (s.id !== sectionId) return s;
          const blocks = (s.contentBlocks ?? []).map((b) => {
            if (b.type !== "attributes" || b.id !== blockId) return b;
            const pairs = { ...b.keyValuePairs };
            let finalKey = key;
            if (key in pairs) {
              const base = key.replace(/\s*\d+$/, "").trim() || key;
              let n = 2;
              while (`${base} ${n}` in pairs) n++;
              finalKey = `${base} ${n}`;
            }
            pairs[finalKey] = value;
            const order = (b.attributeOrder ?? Object.keys(b.keyValuePairs));
            const nextOrder = order.includes(finalKey) ? order : [...order, finalKey];
            return { ...b, keyValuePairs: pairs, attributeOrder: nextOrder };
          });
          return { ...s, contentBlocks: blocks };
        });
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    updateAttributeKey: (projectId, characterId, sectionId, blockId, key, value) => {
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) => {
          if (s.id !== sectionId) return s;
          const blocks = (s.contentBlocks ?? []).map((b) => {
            if (b.type !== "attributes" || b.id !== blockId || !(key in (b.keyValuePairs ?? {}))) return b;
            const pairs = { ...b.keyValuePairs, [key]: value };
            return { ...b, keyValuePairs: pairs };
          });
          return { ...s, contentBlocks: blocks };
        });
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    removeAttributeKey: (projectId, characterId, sectionId, blockId, key) => {
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) => {
          if (s.id !== sectionId) return s;
          const blocks = (s.contentBlocks ?? []).map((b) => {
            if (b.type !== "attributes" || b.id !== blockId) return b;
            const pairs = { ...b.keyValuePairs };
            delete pairs[key];
            const order = (b.attributeOrder ?? Object.keys(b.keyValuePairs)).filter((k) => k !== key);
            const attributeMeta = { ...(b.attributeMeta ?? {}) };
            delete attributeMeta[key];
            return { ...b, keyValuePairs: pairs, attributeOrder: order, attributeMeta: Object.keys(attributeMeta).length > 0 ? attributeMeta : undefined };
          });
          return { ...s, contentBlocks: blocks };
        });
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    renameAttributeKey: (projectId, characterId, sectionId, blockId, oldKey, newKey) => {
      const trimmed = newKey.trim();
      if (!trimmed || trimmed === oldKey) return;
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) => {
          if (s.id !== sectionId) return s;
          const blocks = (s.contentBlocks ?? []).map((b) => {
            if (b.type !== "attributes" || b.id !== blockId || !(oldKey in (b.keyValuePairs ?? {}))) return b;
            const pairs = { ...b.keyValuePairs };
            const val = pairs[oldKey];
            delete pairs[oldKey];
            pairs[trimmed] = val;
            const order = (b.attributeOrder ?? Object.keys(b.keyValuePairs)).map((k) => (k === oldKey ? trimmed : k));
            const attributeMeta = { ...(b.attributeMeta ?? {}) };
            if (oldKey in attributeMeta) {
              attributeMeta[trimmed] = attributeMeta[oldKey];
              delete attributeMeta[oldKey];
            }
            return { ...b, keyValuePairs: pairs, attributeOrder: order, attributeMeta: Object.keys(attributeMeta).length > 0 ? attributeMeta : undefined };
          });
          return { ...s, contentBlocks: blocks };
        });
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    updateAttributeMeta: (projectId, characterId, sectionId, blockId, key, meta) => {
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) => {
          if (s.id !== sectionId) return s;
          const blocks = (s.contentBlocks ?? []).map((b) => {
            if (b.type !== "attributes" || b.id !== blockId || !(key in (b.keyValuePairs ?? {}))) return b;
            const current = (b.attributeMeta ?? {})[key] ?? {};
            const nextMeta = { ...current, ...meta };
            if (nextMeta.options) nextMeta.options = [...new Set(nextMeta.options)];
            const attributeMeta = { ...(b.attributeMeta ?? {}), [key]: nextMeta };
            return { ...b, attributeMeta };
          });
          return { ...s, contentBlocks: blocks };
        });
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    reorderAttributeKeys: (projectId, characterId, sectionId, blockId, fromIndex, toIndex) => {
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) => {
          if (s.id !== sectionId) return s;
          const blocks = (s.contentBlocks ?? []).map((b) => {
            if (b.type !== "attributes" || b.id !== blockId) return b;
            const order = b.attributeOrder ?? Object.keys(b.keyValuePairs ?? {});
            const nextOrder = [...order];
            const [removed] = nextOrder.splice(fromIndex, 1);
            if (!removed) return b;
            nextOrder.splice(toIndex, 0, removed);
            return { ...b, attributeOrder: nextOrder };
          });
          return { ...s, contentBlocks: blocks };
        });
        return { ...c, sections };
      });
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
    },

    listTemplates: (projectId) => loadTemplatesFromStorage(projectId),

    saveTemplateFromCharacter: (projectId, characterId, name) => {
      const chars = loadFromStorage(projectId);
      const char = chars.find((c) => c.id === characterId);
      if (!char || (char.sections ?? []).length === 0) return null;
      const templateSections = sectionsToTemplateFormat(char.sections ?? []);
      const customDataTypes = char.customDataTypes ?? [];
      const templates = loadTemplatesFromStorage(projectId);
      const dupCount = templates.filter((t) => t.name === name.trim()).length;
      const finalName = dupCount > 0 ? `${name.trim()} (${dupCount + 1})` : name.trim() || "Untitled";
      const template: ChartLayoutTemplate = {
        id: generateId(),
        name: finalName,
        createdAt: Date.now(),
        customDataTypes,
        sections: templateSections,
      };
      const next = [...templates, template];
      saveTemplatesToStorage(projectId, next);
      get().ensureDefaultFolders();
      const folders = loadFoldersFromStorage(projectId);
      const layoutFolder = sortByOrder(folders.filter((f) => f.kind === "layout"))[0];
      if (layoutFolder) {
        const docs = [...loadDocumentsFromStorage(projectId), createLayoutDocumentRecord(template, layoutFolder.id)];
        saveDocumentsToStorage(projectId, docs);
        if (get().activeProjectId === projectId) set({ documents: docs });
      }
      return template.id;
    },

    applyTemplateToCharacter: (projectId, characterId, templateId, mode) => {
      const templates = loadTemplatesFromStorage(projectId);
      const template = templates.find((t) => t.id === templateId);
      if (!template) return;
      const chars = loadFromStorage(projectId);
      const char = chars.find((c) => c.id === characterId);
      if (!char) return;
      const existing = char.sections ?? [];
      const nextSections = applyTemplateSections(template.sections, existing, "replace");
      const linked = mode === "link" ? templateId : null;
      const customDataTypes = template.customDataTypes ?? [];
      const updated = chars.map((c) =>
        c.id === characterId ? { ...c, sections: nextSections, linkedTemplateId: linked, customDataTypes } : c
      );
      saveToStorage(projectId, updated);
      if (get().activeProjectId === projectId) set({ characters: updated });
    },
    unlinkCharacterFromTemplate: (projectId, characterId) => {
      const chars = loadFromStorage(projectId);
      const updated = chars.map((c) =>
        c.id === characterId ? { ...c, linkedTemplateId: null } : c
      );
      saveToStorage(projectId, updated);
      if (get().activeProjectId === projectId) set({ characters: updated });
    },
    getTemplateById: (projectId, templateId) => {
      const templates = loadTemplatesFromStorage(projectId);
      return templates.find((t) => t.id === templateId) ?? null;
    },

    syncLinkedCharacterWithTemplate: (projectId, characterId) => {
      const chars = loadFromStorage(projectId);
      const char = chars.find((c) => c.id === characterId);
      const linkedId = char?.linkedTemplateId ?? null;
      if (!char || !linkedId) return false;
      const template = get().getTemplateById(projectId, linkedId);
      if (!template) return false;
      const nextSections = applyTemplateSections(template.sections, char.sections ?? [], "merge");
      const nextCustomDataTypes = template.customDataTypes ?? char.customDataTypes ?? [];
      const sectionsChanged = JSON.stringify(nextSections) !== JSON.stringify(char.sections ?? []);
      const typesChanged = JSON.stringify(nextCustomDataTypes) !== JSON.stringify(char.customDataTypes ?? []);
      if (!sectionsChanged && !typesChanged) return false;
      const updated = { ...char, sections: nextSections, customDataTypes: nextCustomDataTypes };
      const nextChars = chars.map((c) => (c.id === characterId ? updated : c));
      saveToStorage(projectId, nextChars);
      if (get().activeProjectId === projectId) set({ characters: nextChars });
      return true;
    },

    loadTemplateForEditing: (projectId, templateId) => {
      const templates = loadTemplatesFromStorage(projectId);
      const template = templates.find((t) => t.id === templateId);
      if (!template || !template.sections?.length) return;
      const templateOrdered = getOrderedSections(template.sections);
      const sections = templateSectionsToCharacter(templateOrdered);
      const customDataTypes = template.customDataTypes ?? [];
      const builtinDataTypes = template.builtinDataTypes ?? [];
      set({
        chartLayoutMode: "createLayout" as ChartLayoutMode,
        createLayoutDraftSections: sections,
        createLayoutDraftDataTypes: customDataTypes,
        createLayoutDraftBuiltinDataTypes: builtinDataTypes,
        editingTemplateId: templateId,
        createLayoutDirty: false,
      });
    },

    updateTemplate: (projectId, templateId) => {
      const pid = projectId || get().activeProjectId;
      if (!pid) {
        console.warn("[ChartsStore] updateTemplate: no projectId or activeProjectId");
        return false;
      }
      const sections = get().createLayoutDraftSections;
      const customDataTypes = get().createLayoutDraftDataTypes ?? [];
      const builtinDataTypes = get().createLayoutDraftBuiltinDataTypes ?? [];
      const templates = loadTemplatesFromStorage(pid);
      const template = templates.find((t) => t.id === templateId);
      if (!template) {
        console.warn("[ChartsStore] updateTemplate: template not found", { projectId: pid, templateId });
        return false;
      }
      if (!sections || sections.length === 0) {
        console.warn("[ChartsStore] updateTemplate: createLayoutDraftSections is empty");
      }
      try {
        const templateSections = sectionsToTemplateFormat(sections);
        const updatedTemplate = { ...template, sections: templateSections, customDataTypes, builtinDataTypes };
        const updatedTemplates = templates.map((t) =>
          t.id === templateId ? updatedTemplate : t
        );
        saveTemplatesToStorage(pid, updatedTemplates);

        const chars = loadFromStorage(pid);
        const linkedChars = chars.filter((c) => (c.linkedTemplateId ?? null) === templateId);
        if (linkedChars.length > 0) {
          const nextChars = chars.map((c) => {
            if ((c.linkedTemplateId ?? null) !== templateId) return c;
            const nextSections = applyTemplateSections(updatedTemplate.sections, c.sections ?? [], "merge");
            return { ...c, sections: nextSections, customDataTypes: updatedTemplate.customDataTypes ?? [] };
          });
          saveToStorage(pid, nextChars);
          if (get().activeProjectId === pid) set({ characters: nextChars });
        }

        set({ createLayoutDirty: false });
        return true;
      } catch (e) {
        console.warn("[ChartsStore] updateTemplate failed:", e);
        return false;
      }
    },

    renameTemplate: (projectId, templateId, name) => {
      const trimmed = name.trim() || "Untitled";
      const templates = loadTemplatesFromStorage(projectId).map((t) =>
        t.id === templateId ? { ...t, name: trimmed } : t
      );
      saveTemplatesToStorage(projectId, templates);
      const template = templates.find((t) => t.id === templateId);
      const docs = loadDocumentsFromStorage(projectId).map((d) => {
        if (d.templateId !== templateId) return d;
        if (d.autoNamed && template) return { ...d, name: template.name, updatedAt: Date.now() };
        return d;
      });
      saveDocumentsToStorage(projectId, docs);
      if (get().activeProjectId === projectId) set({ documents: docs });
    },

    deleteTemplate: (projectId, templateId) => {
      const chars = loadFromStorage(projectId);
      const updated = chars.map((c) =>
        (c.linkedTemplateId ?? null) === templateId ? { ...c, linkedTemplateId: null } : c
      );
      saveToStorage(projectId, updated);
      const templates = loadTemplatesFromStorage(projectId).filter((t) => t.id !== templateId);
      saveTemplatesToStorage(projectId, templates);
      const docs = loadDocumentsFromStorage(projectId).filter((d) => d.templateId !== templateId);
      saveDocumentsToStorage(projectId, docs);
      if (get().activeProjectId === projectId) set({ characters: updated, documents: docs });
    },

    createTemplateFromSections: (projectId, name, sections, customDataTypes = [], builtinDataTypes = []) => {
      if (!sections || sections.length === 0) return null;
      const templateSections = sectionsToTemplateFormat(sections);
      const templates = loadTemplatesFromStorage(projectId);
      const dupCount = templates.filter((t) => t.name === name.trim()).length;
      const finalName = dupCount > 0 ? `${name.trim()} (${dupCount + 1})` : name.trim() || "Untitled";
      const template: ChartLayoutTemplate = {
        id: generateId(),
        name: finalName,
        createdAt: Date.now(),
        customDataTypes,
        builtinDataTypes: builtinDataTypes.length > 0 ? builtinDataTypes : undefined,
        sections: templateSections,
      };
      const next = [...templates, template];
      saveTemplatesToStorage(projectId, next);
      get().ensureDefaultFolders();
      const folders = loadFoldersFromStorage(projectId);
      const layoutFolder = sortByOrder(folders.filter((f) => f.kind === "layout"))[0];
      if (layoutFolder) {
        const docs = [...loadDocumentsFromStorage(projectId), createLayoutDocumentRecord(template, layoutFolder.id)];
        saveDocumentsToStorage(projectId, docs);
        if (get().activeProjectId === projectId) set({ documents: docs });
      }
      return template.id;
    },

    applyProfilesFromScript: (projectId, characters) => {
      const migrated = characters.map(migrateCharacter);
      saveToStorage(projectId, migrated);
      const s = get();
      // Always update UI when applying; sync activeProjectId if mismatched (e.g. route/store desync)
      set({
        characters: migrated,
        selectedCharacterId: migrated[0]?.id ?? null,
        chartLayoutMode: "fill" as ChartLayoutMode,
        editLayoutDirty: false,
        ...(s.activeProjectId !== projectId ? { activeProjectId: projectId } : {}),
      });
    },
  }))
);
