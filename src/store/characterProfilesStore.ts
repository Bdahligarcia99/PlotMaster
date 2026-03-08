import { create } from "zustand";

const PROFILES_STORAGE_KEY = (projectId: string) =>
  `plotmaster:profiles:${projectId}`;

export type SectionHeadingLevel = "h1" | "h2";

/** Note block - section-scoped note */
export interface NoteBlock {
  type: "note";
  id: string;
  content: string;
}

/** Attribute block - key/value pairs with order */
export interface AttributeBlock {
  type: "attributes";
  id: string;
  keyValuePairs: Record<string, string>;
  attributeOrder?: string[];
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

interface CharacterProfilesStore {
  activeProjectId: string | null;
  characters: CharacterEntity[];
  selectedCharacterId: string | null;
  setActiveProject: (projectId: string | null) => void;
  setSelectedCharacter: (characterId: string | null) => void;
  loadCharacters: (projectId: string) => void;
  addCharacter: (projectId: string, name?: string) => string;
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
  updateContentBlock: (projectId: string, characterId: string, sectionId: string, blockId: string, updates: Partial<NoteBlock> | Partial<AttributeBlock> | Partial<ImageBlock>) => void;
  removeContentBlock: (projectId: string, characterId: string, sectionId: string, blockId: string) => void;
  reorderContentBlocks: (projectId: string, characterId: string, sectionId: string, fromIndex: number, toIndex: number) => void;

  // Attribute block specifics
  addAttributeKey: (projectId: string, characterId: string, sectionId: string, blockId: string, key?: string, value?: string) => void;
  updateAttributeKey: (projectId: string, characterId: string, sectionId: string, blockId: string, key: string, value: string) => void;
  removeAttributeKey: (projectId: string, characterId: string, sectionId: string, blockId: string, key: string) => void;
  renameAttributeKey: (projectId: string, characterId: string, sectionId: string, blockId: string, oldKey: string, newKey: string) => void;
  reorderAttributeKeys: (projectId: string, characterId: string, sectionId: string, blockId: string, fromIndex: number, toIndex: number) => void;
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
        headingLevel: (cat.headingLevel === "h2" ? "h2" : "h1") as SectionHeadingLevel,
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

    setSelectedCharacter: (characterId) => {
      set({ selectedCharacterId: characterId });
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
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const siblings = (c.sections ?? []).filter((s) => (s.parentId ?? null) === parentId);
        const maxOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
        const section: ProfileSection = {
          id: sectionId,
          label: label.trim() || "New section",
          headingLevel: parentId ? "h2" : "h1",
          parentId,
          contentBlocks: [],
          order: maxOrder,
        };
        return { ...c, sections: [...(c.sections ?? []), section] };
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
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).filter(
          (s) => s.id !== sectionId && s.parentId !== sectionId
        );
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
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const movingSection = (c.sections ?? []).find((s) => s.id === sectionId);
        const targetSection = (c.sections ?? []).find((s) => s.id === targetSectionId);
        if (!movingSection || !targetSection) return c;
        const targetSiblings = (c.sections ?? []).filter((s) => (s.parentId ?? null) === targetParentId);
        const sorted = [...targetSiblings].sort((a, b) => a.order - b.order);
        const toIndex = sorted.findIndex((s) => s.id === targetSectionId);
        if (toIndex < 0) return c;
        const needNest = (movingSection.parentId ?? null) !== targetParentId;
        let sections = c.sections ?? [];
        if (needNest) {
          sections = sections.map((s) =>
            s.id === sectionId
              ? { ...s, parentId: targetParentId, headingLevel: targetParentId ? "h2" : "h1" as SectionHeadingLevel }
              : s
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
      const existing = loadFromStorage(projectId);
      const chars = existing.map((c) => {
        if (c.id !== characterId) return c;
        const sections = (c.sections ?? []).map((s) =>
          s.id === sectionId
            ? { ...s, parentId: newParentId, headingLevel: newParentId ? "h2" : "h1" as SectionHeadingLevel }
            : s
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
            block = { type: "attributes", id: blockId, keyValuePairs: {}, attributeOrder: [] };
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
            return { ...b, keyValuePairs: pairs, attributeOrder: order };
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
            return { ...b, keyValuePairs: pairs, attributeOrder: order };
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
  })
);
