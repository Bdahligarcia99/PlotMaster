import { create } from "zustand";

const PROFILES_STORAGE_KEY = (projectId: string) =>
  `plotmaster:profiles:${projectId}`;

const TEMPLATES_STORAGE_KEY = (projectId: string) =>
  `plotmaster:profiles:templates:${projectId}`;

export type SectionHeadingLevel = "h1" | "h2" | "h3" | "h4";

/** Note block - section-scoped note */
export interface NoteBlock {
  type: "note";
  id: string;
  content: string;
}

export type AttributeType = "text" | "number" | "select";

/** Metadata per attribute key - optional; missing = treat as text */
export interface AttributeMetaItem {
  type?: AttributeType;
  options?: string[];
  allowCustom?: boolean;
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
}

/** Chart layout template - structure only, no character-specific values */
export interface ChartLayoutTemplate {
  id: string;
  name: string;
  createdAt?: number;
  sections: ProfileSection[];
}

export type ChartLayoutMode = "fill" | "edit" | "createLayout";

interface CharacterProfilesStore {
  activeProjectId: string | null;
  characters: CharacterEntity[];
  selectedCharacterId: string | null;
  chartLayoutMode: ChartLayoutMode;
  editLayoutDirty: boolean;
  setActiveProject: (projectId: string | null) => void;
  setSelectedCharacter: (characterId: string | null) => void;
  setChartLayoutMode: (mode: ChartLayoutMode) => void;
  setEditLayoutDirty: (dirty: boolean) => void;
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
  applyTemplateToCharacter: (projectId: string, characterId: string, templateId: string, mode: "replace" | "merge") => void;
  renameTemplate: (projectId: string, templateId: string, name: string) => void;
  deleteTemplate: (projectId: string, templateId: string) => void;
  createTemplateFromSections: (projectId: string, name: string, sections: ProfileSection[]) => string | null;
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
    return {
      id: c.id,
      name: c.name,
      sections: (c as CharacterEntity).sections.map((s) => ({
        ...s,
        contentBlocks: s.contentBlocks ?? [],
      })),
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

  return { id: c.id, name: c.name, sections };
}

function loadFromStorage(projectId: string): CharacterEntity[] {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    return parsed.map(migrateCharacter);
  } catch {
    return [];
  }
}

function saveToStorage(projectId: string, characters: CharacterEntity[]) {
  try {
    localStorage.setItem(
      PROFILES_STORAGE_KEY(projectId),
      JSON.stringify(characters)
    );
  } catch (e) {
    console.warn("[CharacterProfilesStore] Save failed:", e);
  }
}

function loadTemplatesFromStorage(projectId: string): ChartLayoutTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY(projectId));
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
    console.warn("[CharacterProfilesStore] Template save failed:", e);
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
        return { type: "note" as const, id: generateId(), content: "" };
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
              options: [...new Set(opts)],
              allowCustom: m.allowCustom ?? false,
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

  for (const ts of templateOrdered) {
    const labelKey = ts.label.toLowerCase();
    const existing = existingByLabel.get(labelKey);
    if (existing) {
      templateIdToCharId.set(ts.id, existing.id);
      const attrKeys = existingAttrKeys.get(labelKey) ?? new Set();
      for (const tb of ts.contentBlocks ?? []) {
        if (tb.type === "attributes") {
          const keysToAdd = (tb.attributeOrder ?? Object.keys(tb.keyValuePairs ?? {})).filter(
            (k) => !attrKeys.has(k)
          );
          if (keysToAdd.length > 0) {
            const block = (existing.contentBlocks ?? []).find(
              (b): b is AttributeBlock => b.type === "attributes"
            );
            const tbMeta = tb.attributeMeta ?? {};
            if (block) {
              const pairs = { ...block.keyValuePairs };
              const order = [...(block.attributeOrder ?? Object.keys(pairs))];
              const attributeMeta = { ...(block.attributeMeta ?? {}) };
              for (const k of keysToAdd) {
                pairs[k] = "";
                order.push(k);
                attrKeys.add(k);
                if (tbMeta[k]) {
                  const m = tbMeta[k];
                  attributeMeta[k] = {
                    type: m.type ?? "text",
                    options: m.options ? [...new Set(m.options)] : undefined,
                    allowCustom: m.allowCustom,
                  };
                }
              }
              existing.contentBlocks = (existing.contentBlocks ?? []).map((b) =>
                b.type === "attributes" && b.id === block.id
                  ? { ...b, keyValuePairs: pairs, attributeOrder: order, attributeMeta: Object.keys(attributeMeta).length > 0 ? attributeMeta : undefined }
                  : b
              );
            } else {
              const attributeMeta: Record<string, AttributeMetaItem> = {};
              for (const k of keysToAdd) {
                if (tbMeta[k]) {
                  const m = tbMeta[k];
                  attributeMeta[k] = { type: m.type ?? "text", options: m.options ? [...new Set(m.options)] : undefined, allowCustom: m.allowCustom };
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
        } else if (tb.type === "note") {
          existing.contentBlocks = [
            ...(existing.contentBlocks ?? []),
            { type: "note" as const, id: generateId(), content: "" },
          ];
        } else if (tb.type === "image") {
          existing.contentBlocks = [
            ...(existing.contentBlocks ?? []),
            { type: "image" as const, id: generateId(), label: tb.label },
          ];
        }
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
    if (b.type === "note") return { type: "note" as const, id: generateId(), content: "" };
    if (b.type === "attributes") {
      const keys = b.attributeOrder ?? Object.keys(b.keyValuePairs ?? {});
      const meta = b.attributeMeta ?? {};
      const attributeMeta: Record<string, AttributeMetaItem> = {};
      for (const k of keys) {
        if (meta[k]) {
          const m = meta[k];
          attributeMeta[k] = {
            type: m.type ?? "text",
            options: m.options ? [...new Set(m.options)] : undefined,
            allowCustom: m.allowCustom,
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

export const useCharacterProfilesStore = create<CharacterProfilesStore>(
  (set, get) => ({
    activeProjectId: null,
    characters: [],
    selectedCharacterId: null,
    chartLayoutMode: "fill" as ChartLayoutMode,
    editLayoutDirty: false,

    setSelectedCharacter: (characterId) => {
      set({ selectedCharacterId: characterId, chartLayoutMode: "fill" as ChartLayoutMode, editLayoutDirty: false });
    },

    setChartLayoutMode: (mode) => {
      set({ chartLayoutMode: mode, editLayoutDirty: mode !== "edit" ? false : get().editLayoutDirty });
    },

    setEditLayoutDirty: (dirty) => {
      set({ editLayoutDirty: dirty });
    },

    setActiveProject: (projectId) => {
      set({ activeProjectId: projectId, selectedCharacterId: null });
      if (projectId) {
        get().loadCharacters(projectId);
      } else {
        set({ characters: [] });
      }
    },

    loadCharacters: (projectId) => {
      const chars = loadFromStorage(projectId);
      set({ characters: chars, activeProjectId: projectId });
    },

    addCharacter: (projectId, name = "New Character") => {
      const id = generateId();
      const entity: CharacterEntity = { id, name, sections: [] };
      const existing = loadFromStorage(projectId);
      const chars = [...existing, entity];
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
      return id;
    },

    removeCharacter: (projectId, characterId) => {
      const existing = loadFromStorage(projectId);
      const chars = existing.filter((c) => c.id !== characterId);
      saveToStorage(projectId, chars);
      const s = get();
      if (s.activeProjectId === projectId) {
        set({
          characters: chars,
          selectedCharacterId: s.selectedCharacterId === characterId ? null : s.selectedCharacterId,
        });
      }
    },

    updateCharacterName: (projectId, characterId, name) => {
      const trimmed = name.trim() || "New Character";
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) =>
        c.id === characterId ? { ...c, name: trimmed } : c
      );
      saveToStorage(projectId, chars);
      if (get().activeProjectId === projectId) set({ characters: chars });
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
            if (b.type !== "attributes" || b.id !== blockId || !(b.keyValuePairs ?? {})[key]) return b;
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
            if (b.type !== "attributes" || b.id !== blockId || !(b.keyValuePairs ?? {})[oldKey]) return b;
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
            if (b.type !== "attributes" || b.id !== blockId || !(b.keyValuePairs ?? {})[key]) return b;
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
      const templates = loadTemplatesFromStorage(projectId);
      const dupCount = templates.filter((t) => t.name === name.trim()).length;
      const finalName = dupCount > 0 ? `${name.trim()} (${dupCount + 1})` : name.trim() || "Untitled";
      const template: ChartLayoutTemplate = {
        id: generateId(),
        name: finalName,
        createdAt: Date.now(),
        sections: templateSections,
      };
      const next = [...templates, template];
      saveTemplatesToStorage(projectId, next);
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
      const nextSections = applyTemplateSections(template.sections, existing, mode);
      const updated = chars.map((c) =>
        c.id === characterId ? { ...c, sections: nextSections } : c
      );
      saveToStorage(projectId, updated);
      if (get().activeProjectId === projectId) set({ characters: updated });
    },

    renameTemplate: (projectId, templateId, name) => {
      const trimmed = name.trim() || "Untitled";
      const templates = loadTemplatesFromStorage(projectId).map((t) =>
        t.id === templateId ? { ...t, name: trimmed } : t
      );
      saveTemplatesToStorage(projectId, templates);
    },

    deleteTemplate: (projectId, templateId) => {
      const templates = loadTemplatesFromStorage(projectId).filter((t) => t.id !== templateId);
      saveTemplatesToStorage(projectId, templates);
    },

    createTemplateFromSections: (projectId, name, sections) => {
      if (!sections || sections.length === 0) return null;
      const templateSections = sectionsToTemplateFormat(sections);
      const templates = loadTemplatesFromStorage(projectId);
      const dupCount = templates.filter((t) => t.name === name.trim()).length;
      const finalName = dupCount > 0 ? `${name.trim()} (${dupCount + 1})` : name.trim() || "Untitled";
      const template: ChartLayoutTemplate = {
        id: generateId(),
        name: finalName,
        createdAt: Date.now(),
        sections: templateSections,
      };
      const next = [...templates, template];
      saveTemplatesToStorage(projectId, next);
      return template.id;
    },
  })
);
