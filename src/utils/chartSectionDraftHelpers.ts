import type {
  ProfileSection,
  SectionHeadingLevel,
  ContentBlock,
  NoteBlock,
  AttributeBlock,
  ImageBlock,
  AttributeMetaItem,
} from "../store/chartsStore";

function generateId() {
  return `_${Math.random().toString(36).slice(2, 11)}`;
}

const NEXT_LEVEL: Record<SectionHeadingLevel, SectionHeadingLevel | null> = {
  h1: "h2",
  h2: "h3",
  h3: "h4",
  h4: null,
};

export function addSectionToDraft(sections: ProfileSection[], parentId: string | null): ProfileSection[] {
  const sectionId = generateId();
  const siblings = sections.filter((s) => (s.parentId ?? null) === parentId);
  const maxOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
  let headingLevel: SectionHeadingLevel = "h1";
  if (parentId) {
    const parent = sections.find((s) => s.id === parentId);
    const next = parent ? NEXT_LEVEL[parent.headingLevel ?? "h1"] : "h2";
    if (!next) return sections;
    headingLevel = next;
  }
  const section: ProfileSection = {
    id: sectionId,
    label: "New section",
    headingLevel,
    parentId,
    contentBlocks: [],
    order: maxOrder,
  };
  return [...sections, section];
}

export function updateSectionInDraft(sections: ProfileSection[], sectionId: string, updates: Partial<ProfileSection>): ProfileSection[] {
  return sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s));
}

function collectDescendantIds(sections: ProfileSection[], sectionId: string): Set<string> {
  const ids = new Set<string>([sectionId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of sections) {
      if (s.parentId && ids.has(s.parentId) && !ids.has(s.id)) {
        ids.add(s.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function removeSectionFromDraft(sections: ProfileSection[], sectionId: string): ProfileSection[] {
  const toRemove = collectDescendantIds(sections, sectionId);
  return sections.filter((s) => !toRemove.has(s.id));
}

export function reorderSectionsInDraft(sections: ProfileSection[], parentId: string | null, fromIndex: number, toIndex: number): ProfileSection[] {
  const siblings = sections.filter((s) => (s.parentId ?? null) === parentId);
  const sorted = [...siblings].sort((a, b) => a.order - b.order);
  const [removed] = sorted.splice(fromIndex, 1);
  if (!removed) return sections;
  sorted.splice(toIndex, 0, removed);
  const orderById = Object.fromEntries(sorted.map((s, i) => [s.id, i]));
  return sections.map((s) => (s.id in orderById ? { ...s, order: orderById[s.id] } : s));
}

export function moveSectionToInDraft(sections: ProfileSection[], sectionId: string, targetParentId: string | null, targetSectionId: string): ProfileSection[] {
  const movingSection = sections.find((s) => s.id === sectionId);
  const targetSection = sections.find((s) => s.id === targetSectionId);
  if (!movingSection || !targetSection) return sections;
  const targetSiblings = sections.filter((s) => (s.parentId ?? null) === targetParentId);
  const sorted = [...targetSiblings].sort((a, b) => a.order - b.order);
  const toIndex = sorted.findIndex((s) => s.id === targetSectionId);
  if (toIndex < 0) return sections;
  const needNest = (movingSection.parentId ?? null) !== targetParentId;
  let result = [...sections];
  if (needNest) {
    const parent = targetParentId ? sections.find((s) => s.id === targetParentId) : null;
    const childLevel: SectionHeadingLevel = targetParentId && parent
      ? (NEXT_LEVEL[parent.headingLevel ?? "h1"] ?? "h2")
      : "h1";
    result = result.map((s) =>
      s.id === sectionId ? { ...s, parentId: targetParentId, headingLevel: childLevel } : s
    );
  }
  const newSiblings = result.filter((s) => (s.parentId ?? null) === targetParentId);
  const newSorted = [...newSiblings].sort((a, b) => a.order - b.order);
  const fromIndex = newSorted.findIndex((s) => s.id === sectionId);
  if (fromIndex < 0 || fromIndex === toIndex) return result;
  const [removed] = newSorted.splice(fromIndex, 1);
  newSorted.splice(toIndex, 0, removed);
  const orderById = Object.fromEntries(newSorted.map((s, i) => [s.id, i]));
  return result.map((s) => (s.id in orderById ? { ...s, order: orderById[s.id] } : s));
}

export function addContentBlockToDraft(sections: ProfileSection[], sectionId: string, blockType: "note" | "attributes" | "image"): ProfileSection[] {
  const blockId = generateId();
  let block: ContentBlock;
  if (blockType === "note") block = { type: "note", id: blockId, content: "" };
  else if (blockType === "attributes") block = { type: "attributes", id: blockId, keyValuePairs: { "Attribute 1": "" }, attributeOrder: ["Attribute 1"] };
  else block = { type: "image", id: blockId };
  return sections.map((s) =>
    s.id === sectionId ? { ...s, contentBlocks: [...(s.contentBlocks ?? []), block] } : s
  );
}

export function addAttributeToSectionInDraft(sections: ProfileSection[], sectionId: string): ProfileSection[] {
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return sections;
  const blocks = section.contentBlocks ?? [];
  const attrsBlocks = blocks.filter((b): b is AttributeBlock => b.type === "attributes");
  const totalAttrCount = attrsBlocks.reduce((sum, b) => sum + (b.attributeOrder ?? Object.keys(b.keyValuePairs ?? {})).length, 0);
  const nextKey = `Attribute ${totalAttrCount + 1}`;

  if (attrsBlocks.length === 0) {
    return addContentBlockToDraft(sections, sectionId, "attributes");
  }
  const lastBlock = attrsBlocks[attrsBlocks.length - 1];
  return addAttributeKeyToDraft(sections, sectionId, lastBlock.id, nextKey);
}

export function updateContentBlockInDraft(sections: ProfileSection[], sectionId: string, blockId: string, updates: Partial<NoteBlock> | Partial<AttributeBlock> | Partial<ImageBlock>): ProfileSection[] {
  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    const blocks = (s.contentBlocks ?? []).map((b) => (b.id === blockId ? { ...b, ...updates } as ContentBlock : b));
    return { ...s, contentBlocks: blocks };
  });
}

export function removeContentBlockFromDraft(sections: ProfileSection[], sectionId: string, blockId: string): ProfileSection[] {
  return sections.map((s) =>
    s.id === sectionId ? { ...s, contentBlocks: (s.contentBlocks ?? []).filter((b) => b.id !== blockId) } : s
  );
}

export function reorderContentBlocksInDraft(sections: ProfileSection[], sectionId: string, fromIndex: number, toIndex: number): ProfileSection[] {
  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    const blocks = [...(s.contentBlocks ?? [])];
    const [removed] = blocks.splice(fromIndex, 1);
    if (!removed) return s;
    blocks.splice(toIndex, 0, removed);
    return { ...s, contentBlocks: blocks };
  });
}

export function addAttributeKeyToDraft(sections: ProfileSection[], sectionId: string, blockId: string, key = "New attribute"): ProfileSection[] {
  return sections.map((s) => {
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
      pairs[finalKey] = "";
      const order = [...(b.attributeOrder ?? Object.keys(b.keyValuePairs)), finalKey];
      return { ...b, keyValuePairs: pairs, attributeOrder: order };
    });
    return { ...s, contentBlocks: blocks };
  });
}

export function updateAttributeMetaInDraft(sections: ProfileSection[], sectionId: string, blockId: string, key: string, meta: Partial<AttributeMetaItem>): ProfileSection[] {
  return sections.map((s) => {
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
}

export function removeAttributeKeyFromDraft(sections: ProfileSection[], sectionId: string, blockId: string, key: string): ProfileSection[] {
  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    const blocks = (s.contentBlocks ?? []).map((b) => {
      if (b.type !== "attributes" || b.id !== blockId) return b;
      const pairs = { ...b.keyValuePairs };
      delete pairs[key];
      const order = (b.attributeOrder ?? []).filter((k) => k !== key);
      const attributeMeta = { ...(b.attributeMeta ?? {}) };
      delete attributeMeta[key];
      return { ...b, keyValuePairs: pairs, attributeOrder: order, attributeMeta: Object.keys(attributeMeta).length > 0 ? attributeMeta : undefined };
    });
    return { ...s, contentBlocks: blocks };
  });
}

export function renameAttributeKeyInDraft(sections: ProfileSection[], sectionId: string, blockId: string, oldKey: string, newKey: string): ProfileSection[] {
  const trimmed = newKey.trim();
  if (!trimmed || trimmed === oldKey) return sections;
  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    const blocks = (s.contentBlocks ?? []).map((b) => {
      if (b.type !== "attributes" || b.id !== blockId || !(oldKey in (b.keyValuePairs ?? {}))) return b;
      const pairs = { ...b.keyValuePairs };
      const val = pairs[oldKey];
      delete pairs[oldKey];
      pairs[trimmed] = val;
      const order = (b.attributeOrder ?? []).map((k) => (k === oldKey ? trimmed : k));
      const attributeMeta = { ...(b.attributeMeta ?? {}) };
      if (oldKey in attributeMeta) {
        attributeMeta[trimmed] = attributeMeta[oldKey];
        delete attributeMeta[oldKey];
      }
      return { ...b, keyValuePairs: pairs, attributeOrder: order, attributeMeta: Object.keys(attributeMeta).length > 0 ? attributeMeta : undefined };
    });
    return { ...s, contentBlocks: blocks };
  });
}
