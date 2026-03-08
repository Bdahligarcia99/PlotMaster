import { useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useCharacterProfilesStore,
  getOrderedSections,
  type ProfileSection,
  type NoteBlock,
  type AttributeBlock,
  type ImageBlock,
  type ContentBlock,
  type SectionHeadingLevel,
  type AttributeMetaItem,
  type AttributeType,
} from "../../store/characterProfilesStore";
import Button from "../ui/Button";
import AutoResizeTextarea from "../ui/AutoResizeTextarea";

function generateId() {
  return `_${Math.random().toString(36).slice(2, 11)}`;
}

function getOrderedAttributeEntries(block: AttributeBlock): [string, string][] {
  const pairs = block.keyValuePairs ?? {};
  const order = block.attributeOrder ?? Object.keys(pairs);
  return order.filter((k) => k in pairs).map((k) => [k, pairs[k] ?? ""]);
}

function getAttributeMeta(block: AttributeBlock, key: string): AttributeMetaItem | undefined {
  return (block.attributeMeta ?? {})[key];
}

function DragHandle({ listeners, attributes }: { listeners?: object; attributes?: object }) {
  return (
    <button
      type="button"
      className="p-1.5 text-dark-muted hover:text-dark-text cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
      title="Drag to reorder"
      {...listeners}
      {...attributes}
    >
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 6h2v2H8V6zm0 4h2v2H8v-2zm0 4h2v2H8v-2zm4-8h2v2h-2V6zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z" />
      </svg>
    </button>
  );
}

function SortableContentBlock({
  id,
  children,
  showDragHandle,
}: {
  id: string;
  children: ReactNode;
  showDragHandle?: boolean;
}) {
  const { setNodeRef, transform, transition, listeners, attributes, isDragging } = useSortable({ id, disabled: !showDragHandle });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={`flex items-start gap-2 ${isDragging ? "opacity-50" : ""}`}>
      {showDragHandle && <DragHandle listeners={listeners} attributes={attributes} />}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

const NEXT_LEVEL: Record<SectionHeadingLevel, SectionHeadingLevel | null> = {
  h1: "h2",
  h2: "h3",
  h3: "h4",
  h4: null,
};

/** Mutate sections in memory - for create layout draft */
function addSectionToDraft(sections: ProfileSection[], parentId: string | null): ProfileSection[] {
  const sectionId = generateId();
  const siblings = sections.filter((s) => (s.parentId ?? null) === parentId);
  const maxOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
  let headingLevel: SectionHeadingLevel = "h1";
  if (parentId) {
    const parent = sections.find((s) => s.id === parentId);
    const next = parent ? NEXT_LEVEL[parent.headingLevel ?? "h1"] : "h2";
    if (!next) return sections; // H4 has no children
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

function updateSectionInDraft(sections: ProfileSection[], sectionId: string, updates: Partial<ProfileSection>): ProfileSection[] {
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

function removeSectionFromDraft(sections: ProfileSection[], sectionId: string): ProfileSection[] {
  const toRemove = collectDescendantIds(sections, sectionId);
  return sections.filter((s) => !toRemove.has(s.id));
}

function addContentBlockToDraft(sections: ProfileSection[], sectionId: string, blockType: "note" | "attributes" | "image"): ProfileSection[] {
  const blockId = generateId();
  let block: ContentBlock;
  if (blockType === "note") block = { type: "note", id: blockId, content: "" };
  else if (blockType === "attributes") block = { type: "attributes", id: blockId, keyValuePairs: { "Attribute 1": "" }, attributeOrder: ["Attribute 1"] };
  else block = { type: "image", id: blockId };
  return sections.map((s) =>
    s.id === sectionId ? { ...s, contentBlocks: [...(s.contentBlocks ?? []), block] } : s
  );
}

/** Add an attribute to a section: creates attributes block with "Attribute 1" if none, otherwise appends to last block as "Attribute 2", "Attribute 3", etc. */
function addAttributeToSectionInDraft(sections: ProfileSection[], sectionId: string): ProfileSection[] {
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

function updateContentBlockInDraft(sections: ProfileSection[], sectionId: string, blockId: string, updates: Partial<NoteBlock> | Partial<AttributeBlock> | Partial<ImageBlock>): ProfileSection[] {
  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    const blocks = (s.contentBlocks ?? []).map((b) => (b.id === blockId ? { ...b, ...updates } as ContentBlock : b));
    return { ...s, contentBlocks: blocks };
  });
}

function removeContentBlockFromDraft(sections: ProfileSection[], sectionId: string, blockId: string): ProfileSection[] {
  return sections.map((s) =>
    s.id === sectionId ? { ...s, contentBlocks: (s.contentBlocks ?? []).filter((b) => b.id !== blockId) } : s
  );
}

function reorderContentBlocksInDraft(sections: ProfileSection[], sectionId: string, fromIndex: number, toIndex: number): ProfileSection[] {
  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    const blocks = [...(s.contentBlocks ?? [])];
    const [removed] = blocks.splice(fromIndex, 1);
    if (!removed) return s;
    blocks.splice(toIndex, 0, removed);
    return { ...s, contentBlocks: blocks };
  });
}

function addAttributeKeyToDraft(sections: ProfileSection[], sectionId: string, blockId: string, key = "New attribute"): ProfileSection[] {
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

function updateAttributeMetaInDraft(sections: ProfileSection[], sectionId: string, blockId: string, key: string, meta: Partial<AttributeMetaItem>): ProfileSection[] {
  return sections.map((s) => {
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
}

function removeAttributeKeyFromDraft(sections: ProfileSection[], sectionId: string, blockId: string, key: string): ProfileSection[] {
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

function renameAttributeKeyInDraft(sections: ProfileSection[], sectionId: string, blockId: string, oldKey: string, newKey: string): ProfileSection[] {
  const trimmed = newKey.trim();
  if (!trimmed || trimmed === oldKey) return sections;
  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    const blocks = (s.contentBlocks ?? []).map((b) => {
      if (b.type !== "attributes" || b.id !== blockId || !(b.keyValuePairs ?? {})[oldKey]) return b;
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

// Reuse AttributeMetaEditor from chart - we'll inline a minimal version
function AttributeMetaEditorPopover({
  keyName,
  meta,
  onSave,
  onClose,
  anchorRect,
}: {
  keyName: string;
  meta?: AttributeMetaItem;
  onSave: (m: Partial<AttributeMetaItem>) => void;
  onClose: () => void;
  anchorRect: DOMRect | null;
}) {
  const [type, setType] = useState<AttributeType>(meta?.type ?? "text");
  const [optionsText, setOptionsText] = useState((meta?.options ?? []).join("\n"));
  const [allowCustom, setAllowCustom] = useState(meta?.allowCustom ?? false);
  const rect = anchorRect;

  const handleSave = () => {
    const opts = optionsText.split("\n").map((s) => s.trim()).filter(Boolean);
    onSave({ type, options: type === "select" ? opts : undefined, allowCustom: type === "select" ? allowCustom : undefined });
    onClose();
  };

  return (
    <div
      className="fixed z-[9999] rounded-lg border border-dark-accent bg-dark-surface shadow-xl p-3 min-w-[200px] max-w-[280px]"
      style={{ top: rect ? rect.bottom + 4 : 0, left: rect ? rect.left : 0 }}
    >
      <div className="text-xs font-medium text-dark-muted mb-2">Attribute: {keyName}</div>
      <div className="space-y-2">
        <div>
          <label className="block text-[10px] text-dark-muted mb-0.5">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as AttributeType)} className="w-full px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded">
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="select">Select</option>
          </select>
        </div>
        {type === "select" && (
          <>
            <div>
              <label className="block text-[10px] text-dark-muted mb-0.5">Options (one per line)</label>
              <textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={3} placeholder={"Brown\nGreen\nBlue"} className="w-full px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded resize-y" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allowCustom} onChange={(e) => setAllowCustom(e.target.checked)} className="rounded" />
              <span className="text-xs text-dark-text">Allow custom values</span>
            </label>
          </>
        )}
      </div>
      <div className="flex justify-end gap-1 mt-2">
        <button type="button" onClick={onClose} className="px-2 py-1 text-xs text-dark-muted hover:text-dark-text">Cancel</button>
        <button type="button" onClick={handleSave} className="px-2 py-1 text-xs bg-blue-600 text-white rounded">Save</button>
      </div>
    </div>
  );
}

export default function CreateLayoutEditor({ onClose }: { onClose: () => void }) {
  const { id: projectId } = useParams<{ id: string }>();
  const setChartLayoutMode = useCharacterProfilesStore((s) => s.setChartLayoutMode);
  const createTemplateFromSections = useCharacterProfilesStore((s) => s.createTemplateFromSections);

  const [sections, setSections] = useState<ProfileSection[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingKeyBlockId, setEditingKeyBlockId] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [draftSectionLabel, setDraftSectionLabel] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [metaEditorFor, setMetaEditorFor] = useState<{ blockId: string; key: string } | null>(null);
  const [metaEditorAnchorRect, setMetaEditorAnchorRect] = useState<DOMRect | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [expandedNoteBlocks, setExpandedNoteBlocks] = useState<Set<string>>(new Set());

  const orderedSections = getOrderedSections(sections);
  const hasProgress = sections.length > 0;
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  const hasCollapsedAncestor = (sectionId: string): boolean => {
    let id: string | null = sectionById.get(sectionId)?.parentId ?? null;
    while (id) {
      if (collapsedSections.has(id)) return true;
      id = sectionById.get(id)?.parentId ?? null;
    }
    return false;
  };

  const visibleSections = orderedSections.filter((s) => !hasCollapsedAncestor(s.id));

  const getAddChildLabel = (level: SectionHeadingLevel): string | null => {
    const next = NEXT_LEVEL[level];
    return next ? `+${next.toUpperCase()}` : null;
  };

  const handleAddSection = (parentId?: string | null) => {
    setSections((prev) => addSectionToDraft(prev, parentId ?? null));
  };

  const handleSaveAsTemplate = () => {
    setSaveError(null);
    if (sections.length === 0) {
      setSaveError("Add at least one section before saving.");
      return;
    }
    const name = templateName.trim() || "Untitled";
    if (!projectId) return;
    const id = createTemplateFromSections(projectId, name, sections);
    if (id) {
      setChartLayoutMode("fill");
      onClose();
    } else {
      setSaveError("Could not save template.");
    }
  };

  const handleCancel = () => {
    if (hasProgress) {
      setDiscardConfirmOpen(true);
      return;
    }
    setChartLayoutMode("fill");
    onClose();
  };

  const confirmDiscard = () => {
    setDiscardConfirmOpen(false);
    setChartLayoutMode("fill");
    onClose();
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleBlockDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (!activeId.startsWith("block-") || !overId.startsWith("block-") || activeId === overId) return;
    const activeBlockId = activeId.replace("block-", "");
    const overBlockId = overId.replace("block-", "");
    const section = sections.find((s) => (s.contentBlocks ?? []).some((b) => b.id === activeBlockId));
    if (!section) return;
    const blocks = section.contentBlocks ?? [];
    const fromIndex = blocks.findIndex((b) => b.id === activeBlockId);
    const toIndex = blocks.findIndex((b) => b.id === overBlockId);
    if (fromIndex >= 0 && toIndex >= 0) {
      setSections((p) => reorderContentBlocksInDraft(p, section.id, fromIndex, toIndex));
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-dark-surface/30 overflow-hidden">
      <div className="p-4 border-b border-dark-accent/50 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">New Layout</h2>
          <p className="text-dark-muted text-xs mt-1">Define structure only (sections, attributes, notes, images). No character data.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => setSaveModalOpen(true)}>
            Save as template
          </Button>
        </div>
      </div>

      <div className="p-4 overflow-y-auto">
        <div className="max-w-2xl space-y-6">
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => handleAddSection(null)} title="Add top-level section (H1)">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m7 7v-7" />
              </svg>
              +H1
            </Button>
          </div>

          {visibleSections.length === 0 ? (
            <p className="text-dark-muted text-sm py-4">No sections yet. Add a top-level section to start.</p>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleBlockDragEnd}>
            <div className="space-y-4">
              {visibleSections.map((section) => {
                const level = (section.headingLevel ?? "h1") as SectionHeadingLevel;
                const levelStyles: Record<SectionHeadingLevel, string> = { h1: "ml-0", h2: "ml-4", h3: "ml-8", h4: "ml-12" };
                const nameStyles: Record<SectionHeadingLevel, string> = {
                  h1: "text-sm font-semibold uppercase tracking-wide",
                  h2: "text-sm font-medium",
                  h3: "text-xs font-medium",
                  h4: "text-xs font-normal text-dark-muted",
                };
                const blocks = section.contentBlocks ?? [];
                const isCollapsed = collapsedSections.has(section.id);
                const addChildLabel = getAddChildLabel(level);

                return (
                  <section key={section.id} className={`border border-dark-accent/30 rounded-lg overflow-hidden bg-dark-bg/30 ${levelStyles[level]}`}>
                    <div className="px-3 py-2 bg-dark-accent/20 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setCollapsedSections((prev) => { const n = new Set(prev); n.has(section.id) ? n.delete(section.id) : n.add(section.id); return n; })}
                        className="p-0.5 text-dark-muted hover:text-dark-text"
                        title={isCollapsed ? "Expand (show descendants)" : "Collapse (hide descendants)"}
                      >
                        <span className={isCollapsed ? "" : "inline-block rotate-90"}>▶</span>
                      </button>
                      {editingSectionId === section.id ? (
                        <input
                          type="text"
                          value={draftSectionLabel}
                          onChange={(e) => setDraftSectionLabel(e.target.value)}
                          onBlur={() => {
                            const trimmed = draftSectionLabel.trim() || "New section";
                            setSections((p) => updateSectionInDraft(p, section.id, { label: trimmed }));
                            setEditingSectionId(null);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          autoFocus
                          className={`flex-1 px-2 py-1 bg-dark-bg border border-blue-500 rounded ${nameStyles[level]}`}
                        />
                      ) : (
                        <button type="button" onClick={() => { setEditingSectionId(section.id); setDraftSectionLabel(section.label); }} className={`flex-1 text-left px-2 py-1 ${nameStyles[level]}`}>
                          {section.label}
                        </button>
                      )}
                      <div className="flex gap-1">
                        {!isCollapsed && addChildLabel && (
                          <button
                            type="button"
                            onClick={() => handleAddSection(section.id)}
                            className="px-2 py-1 text-xs font-medium text-dark-muted hover:text-blue-400 rounded border border-dark-accent/40 hover:border-blue-500/50"
                            title={`Add ${addChildLabel.replace("+", "")} as child of this ${level.toUpperCase()}`}
                          >
                            {addChildLabel}
                          </button>
                        )}
                        <button type="button" onClick={() => setSections((p) => removeSectionFromDraft(p, section.id))} className="p-1.5 text-dark-muted hover:text-red-400 rounded" title="Remove section and all descendants">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                    {!collapsedSections.has(section.id) && (
                      <SortableContext
                        items={blocks.map((b) => `block-${b.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                      <div className="px-3 pb-3 pt-1 space-y-3">
                        {blocks.map((block) => {
                          if (block.type === "note") {
                            const noteContent = block.content ?? "";
                            const noteLines = noteContent.split("\n");
                            const isLongNote = noteLines.length > 4;
                            const noteExpanded = expandedNoteBlocks.has(block.id);
                            return (
                              <SortableContentBlock key={block.id} id={`block-${block.id}`} showDragHandle>
                                <div className="py-2 border-b border-dark-accent/20 flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className={isLongNote && !noteExpanded ? "max-h-[6.5rem] overflow-y-auto" : undefined}>
                                    <AutoResizeTextarea
                                      value={noteContent}
                                      onChange={(v) => setSections((p) => updateContentBlockInDraft(p, section.id, block.id, { content: v }))}
                                      placeholder="Note content…"
                                      className="w-full px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent/40 rounded text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-blue-500 min-h-[4rem]"
                                    />
                                  </div>
                                  {isLongNote && (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedNoteBlocks((s) => {
                                        const n = new Set(s);
                                        n.has(block.id) ? n.delete(block.id) : n.add(block.id);
                                        return n;
                                      })}
                                      className="mt-1 text-xs text-blue-400 hover:text-blue-300"
                                    >
                                      {noteExpanded ? "Show less" : "Show more"}
                                    </button>
                                  )}
                                </div>
                                <button type="button" onClick={() => setSections((p) => removeContentBlockFromDraft(p, section.id, block.id))} className="p-1.5 text-dark-muted hover:text-red-400 rounded flex-shrink-0">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                              </SortableContentBlock>
                            );
                          }
                          if (block.type === "image") {
                            return (
                              <SortableContentBlock key={block.id} id={`block-${block.id}`} showDragHandle>
                              <div className="py-2 border-b border-dark-accent/20">
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <input
                                      type="text"
                                      value={block.label ?? ""}
                                      onChange={(e) => setSections((p) => updateContentBlockInDraft(p, section.id, block.id, { label: e.target.value }))}
                                      placeholder="Image label (optional)"
                                      className="w-full px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent/40 rounded text-dark-text placeholder:text-dark-muted mb-2"
                                    />
                                    <div className="border-2 border-dashed border-dark-accent/40 rounded-lg flex flex-col items-center justify-center py-8 px-4 bg-dark-bg/30 min-h-[120px]">
                                      <span className="text-dark-muted text-sm">Image</span>
                                      <span className="text-dark-muted text-xs mt-0.5">
                                        {block.label ? `"${block.label}"` : "Container placeholder"}
                                      </span>
                                    </div>
                                  </div>
                                  <button type="button" onClick={() => setSections((p) => removeContentBlockFromDraft(p, section.id, block.id))} className="p-1.5 text-dark-muted hover:text-red-400 rounded flex-shrink-0">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                              </div>
                              </SortableContentBlock>
                            );
                          }
                          if (block.type === "attributes") {
                            const entries = getOrderedAttributeEntries(block);
                            return (
                              <SortableContentBlock key={block.id} id={`block-${block.id}`} showDragHandle>
                              <div className="space-y-1">
                                {entries.map(([key, value]) => (
                                  <div key={key} className="flex items-center gap-2 py-2 border-b border-dark-accent/20">
                                    {editingKeyBlockId === block.id && editingKey === key ? (
                                      <input
                                        type="text"
                                        value={draftKey}
                                        onChange={(e) => setDraftKey(e.target.value)}
                                        onBlur={() => {
                                          const trimmed = draftKey.trim();
                                          if (trimmed && trimmed !== key) setSections((p) => renameAttributeKeyInDraft(p, section.id, block.id, key, trimmed));
                                          setEditingKey(null);
                                          setEditingKeyBlockId(null);
                                        }}
                                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                        autoFocus
                                        className="flex-1 px-2 py-1.5 text-sm bg-dark-bg border border-blue-500 rounded"
                                      />
                                    ) : (
                                      <button type="button" onClick={() => { setEditingKey(key); setEditingKeyBlockId(block.id); setDraftKey(key); }} className="flex-1 text-left px-2 py-1.5 text-sm hover:bg-dark-accent/30 rounded truncate min-w-0">
                                        {key}
                                      </button>
                                    )}
                                    <input
                                      type="text"
                                      value={value}
                                      onChange={(e) => setSections((p) => {
                                        const pairs = { ...(block.keyValuePairs ?? {}), [key]: e.target.value };
                                        return updateContentBlockInDraft(p, section.id, block.id, { keyValuePairs: pairs });
                                      })}
                                      placeholder="Value"
                                      className="flex-1 min-w-0 px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent/40 rounded text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-blue-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        const isOpen = metaEditorFor?.blockId === block.id && metaEditorFor?.key === key;
                                        setMetaEditorFor(isOpen ? null : { blockId: block.id, key });
                                        setMetaEditorAnchorRect(isOpen ? null : (e.currentTarget as HTMLElement).getBoundingClientRect());
                                      }}
                                      className="p-1.5 text-dark-muted hover:text-blue-400 rounded"
                                      title="Attribute type & options"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    </button>
                                    {metaEditorFor?.blockId === block.id && metaEditorFor?.key === key && (
                                      <AttributeMetaEditorPopover
                                        keyName={key}
                                        meta={getAttributeMeta(block, key)}
                                        onSave={(m) => setSections((p) => updateAttributeMetaInDraft(p, section.id, block.id, key, m))}
                                        onClose={() => setMetaEditorFor(null)}
                                        anchorRect={metaEditorAnchorRect}
                                      />
                                    )}
                                    <button type="button" onClick={() => setSections((p) => removeAttributeKeyFromDraft(p, section.id, block.id, key))} className="p-1.5 text-dark-muted hover:text-red-400 rounded">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                              </SortableContentBlock>
                            );
                          }
                          return null;
                        })}
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-accent/20">
                          <button type="button" onClick={() => setSections((p) => addContentBlockToDraft(p, section.id, "note"))} className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text" title="Add notes block with textarea">
                            Add notes
                          </button>
                          <button type="button" onClick={() => setSections((p) => addAttributeToSectionInDraft(p, section.id))} className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text" title="Add new attribute">
                            + New attribute
                          </button>
                          <button type="button" onClick={() => setSections((p) => addContentBlockToDraft(p, section.id, "image"))} className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text" title="Add image container">
                            + Image
                          </button>
                        </div>
                      </div>
                      </SortableContext>
                    )}
                  </section>
                );
              })}
            </div>
            </DndContext>
          )}
        </div>
      </div>

      {saveModalOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50" onClick={() => setSaveModalOpen(false)}>
          <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 min-w-[300px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-dark-text mb-2">Save as template</h3>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded mb-2"
              onKeyDown={(e) => e.key === "Enter" && handleSaveAsTemplate()}
            />
            {saveError && <p className="text-xs text-red-400 mb-2">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSaveModalOpen(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleSaveAsTemplate}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {discardConfirmOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
          <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 max-w-sm mx-4 shadow-lg">
            <h3 className="text-sm font-medium text-dark-text mb-2">Discard new layout?</h3>
            <p className="text-sm text-dark-muted mb-4">
              All progress will be deleted. This cannot be undone. Do you want to proceed?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="primary" size="sm" onClick={() => setDiscardConfirmOpen(false)}>
                Keep editing
              </Button>
              <Button variant="secondary" size="sm" onClick={confirmDiscard}>
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
