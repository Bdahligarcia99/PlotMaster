import React, { useState } from "react";
import { useParams } from "react-router-dom";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useCharacterProfilesStore,
  getOrderedSections,
  type NoteBlock,
  type AttributeBlock,
  type ImageBlock,
  type SectionHeadingLevel,
} from "../../store/characterProfilesStore";
import Button from "../ui/Button";

function getOrderedAttributeEntries(block: AttributeBlock): [string, string][] {
  const pairs = block.keyValuePairs ?? {};
  const order = block.attributeOrder ?? Object.keys(pairs);
  return order
    .filter((k) => k in pairs)
    .map((k) => [k, pairs[k] ?? ""]);
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

function NoteBlockRow({
  note,
  onUpdate,
  onRemove,
  compact,
}: {
  note: NoteBlock;
  onUpdate: (content: string) => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`group flex gap-2 ${compact ? "py-1" : "py-2"}`}>
      <textarea
        value={note.content}
        onChange={(e) => onUpdate(e.target.value)}
        onBlur={(e) => onUpdate(e.target.value)}
        placeholder="Add a note or description..."
        rows={Math.max(2, note.content.split("\n").length)}
        className={`flex-1 px-2 py-1.5 text-sm bg-dark-bg/50 border border-dark-accent/40 rounded text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 resize-y min-h-[3rem] ${
          compact ? "text-xs" : ""
        }`}
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-dark-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors self-start"
        title="Remove note"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

function ImageBlockRow({
  block,
  onUpdate,
  onRemove,
}: {
  block: ImageBlock;
  onUpdate: (updates: Partial<ImageBlock>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="group py-2">
      <div className="border border-dashed border-dark-accent/40 rounded-lg p-4 bg-dark-bg/30">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 space-y-2">
            <input
              type="text"
              value={block.label ?? ""}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder="Image label (optional)"
              className="w-full px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent/40 rounded text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              value={block.imageUrl ?? ""}
              onChange={(e) => onUpdate({ imageUrl: e.target.value })}
              placeholder="Image URL (optional)"
              className="w-full px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent/40 rounded text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-blue-500"
            />
            {block.imageUrl ? (
              <div className="mt-2 rounded overflow-hidden max-h-32 bg-dark-bg">
                <img src={block.imageUrl} alt={block.label || "Image"} className="w-full object-contain" />
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-dark-muted text-xs border border-dark-accent/20 rounded bg-dark-bg/50">
                Image placeholder
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 text-dark-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            title="Remove image block"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableSectionBlock({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, transform, transition, listeners, attributes, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={`flex items-start gap-2 ${isDragging ? "opacity-50" : ""}`}>
      <DragHandle listeners={listeners} attributes={attributes} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function ProfilesChartEditor() {
  const { id: projectId } = useParams<{ id: string }>();
  const characters = useCharacterProfilesStore((s) => s.characters);
  const selectedCharacterId = useCharacterProfilesStore((s) => s.selectedCharacterId);
  const addSection = useCharacterProfilesStore((s) => s.addSection);
  const updateSectionLabel = useCharacterProfilesStore((s) => s.updateSectionLabel);
  const updateSectionHeadingLevel = useCharacterProfilesStore((s) => s.updateSectionHeadingLevel);
  const removeSection = useCharacterProfilesStore((s) => s.removeSection);
  const reorderSections = useCharacterProfilesStore((s) => s.reorderSections);
  const moveSectionTo = useCharacterProfilesStore((s) => s.moveSectionTo);
  const addContentBlock = useCharacterProfilesStore((s) => s.addContentBlock);
  const updateContentBlock = useCharacterProfilesStore((s) => s.updateContentBlock);
  const removeContentBlock = useCharacterProfilesStore((s) => s.removeContentBlock);
  const addAttributeKey = useCharacterProfilesStore((s) => s.addAttributeKey);
  const updateAttributeKey = useCharacterProfilesStore((s) => s.updateAttributeKey);
  const removeAttributeKey = useCharacterProfilesStore((s) => s.removeAttributeKey);
  const renameAttributeKey = useCharacterProfilesStore((s) => s.renameAttributeKey);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingKeyBlockId, setEditingKeyBlockId] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [draftSectionLabel, setDraftSectionLabel] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId);
  const sections = selectedCharacter ? getOrderedSections(selectedCharacter.sections ?? []) : [];

  const handleAddSection = (parentId?: string | null) => {
    if (!projectId || !selectedCharacterId) return;
    addSection(projectId, selectedCharacterId, parentId ?? null);
  };

  const handleSaveSectionEdit = (sectionId: string) => {
    if (!projectId || !selectedCharacterId) return;
    const trimmed = draftSectionLabel.trim() || "New section";
    updateSectionLabel(projectId, selectedCharacterId, sectionId, trimmed);
    setEditingSectionId(null);
  };

  const handleSaveKeyEdit = (sectionId: string, blockId: string, oldKey: string) => {
    if (!projectId || !selectedCharacterId) return;
    const trimmed = draftKey.trim();
    if (trimmed && trimmed !== oldKey) {
      renameAttributeKey(projectId, selectedCharacterId, sectionId, blockId, oldKey, trimmed);
    }
    setEditingKey(null);
    setEditingKeyBlockId(null);
  };

  const handleRemoveAttributeKey = (sectionId: string, blockId: string, key: string) => {
    if (!projectId || !selectedCharacterId) return;
    removeAttributeKey(projectId, selectedCharacterId, sectionId, blockId, key);
    if (editingKeyBlockId === blockId && editingKey === key) {
      setEditingKey(null);
      setEditingKeyBlockId(null);
    }
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !projectId || !selectedCharacterId) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    if (activeId.startsWith("section-")) {
      const sectionId = activeId.replace("section-", "");
      const overSectionId = overId.replace("section-", "");
      const activeSection = sections.find((s) => s.id === sectionId);
      const overSection = sections.find((s) => s.id === overSectionId);
      if (!activeSection || !overSection) return;
      const parentId = activeSection.parentId ?? null;
      const overParentId = overSection.parentId ?? null;
      if (parentId !== overParentId) {
        moveSectionTo(projectId, selectedCharacterId, sectionId, overParentId, overSectionId);
      } else {
        const siblings = sections.filter((s) => (s.parentId ?? null) === parentId);
        const fromIndex = siblings.findIndex((s) => s.id === sectionId);
        const toIndex = siblings.findIndex((s) => s.id === overSectionId);
        if (fromIndex >= 0 && toIndex >= 0) {
          reorderSections(projectId, selectedCharacterId, parentId, fromIndex, toIndex);
        }
      }
    }
  };

  if (!selectedCharacter) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-surface/30 min-h-0">
        <div className="text-center text-dark-muted">
          <p className="text-sm font-medium">Chart Editor</p>
          <p className="text-xs mt-1">Select a character from the entity panel to edit their profile</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-dark-surface/30 overflow-hidden">
      <div className="p-4 border-b border-dark-accent/50 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
            {selectedCharacter.name}
          </h2>
          <p className="text-dark-muted text-xs mt-1">Character profile</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleAddSection(null)}
            title="Add top-level section (H1)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m7 7v-7" />
            </svg>
            Add section (H1)
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="max-w-2xl space-y-6">
            {sections.length === 0 ? (
              <p className="text-dark-muted text-sm py-4">
                No sections yet. Add a top-level section (H1) from the toolbar or the button above.
              </p>
            ) : (
              <SortableContext
                items={sections.map((s) => `section-${s.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {sections.map((section) => {
                  const level = section.headingLevel ?? "h1";
                  const levelStyles: Record<SectionHeadingLevel, string> = {
                    h1: "ml-0",
                    h2: "ml-4",
                  };
                  const nameStyles: Record<SectionHeadingLevel, string> = {
                    h1: "text-sm font-semibold uppercase tracking-wide",
                    h2: "text-sm font-medium",
                  };
                  const blocks = section.contentBlocks ?? [];

                  return (
                    <SortableSectionBlock key={section.id} id={`section-${section.id}`}>
                      <section
                        className={`border border-dark-accent/30 rounded-lg overflow-hidden bg-dark-bg/30 ${levelStyles[level]}`}
                      >
                        <div className="px-3 py-2 bg-dark-accent/20 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSection(section.id)}
                            className="p-0.5 text-dark-muted hover:text-dark-text transition-transform flex-shrink-0"
                            title={collapsedSections.has(section.id) ? "Expand" : "Collapse"}
                          >
                            <span className={collapsedSections.has(section.id) ? "" : "inline-block rotate-90"}>
                              ▶
                            </span>
                          </button>
                          {editingSectionId === section.id ? (
                            <input
                              type="text"
                              value={draftSectionLabel}
                              onChange={(e) => setDraftSectionLabel(e.target.value)}
                              onBlur={() => handleSaveSectionEdit(section.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveSectionEdit(section.id);
                                if (e.key === "Escape") setEditingSectionId(null);
                              }}
                              autoFocus
                              className={`flex-1 px-2 py-1 bg-dark-bg border border-blue-500 rounded text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-500 ${nameStyles[level]}`}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSectionId(section.id);
                                setDraftSectionLabel(section.label);
                              }}
                              className={`flex-1 text-left px-2 py-1 text-dark-text hover:bg-dark-accent/30 rounded ${nameStyles[level]}`}
                            >
                              {section.label}
                            </button>
                          )}
                          <div className="flex items-center gap-1">
                            {(["h1", "h2"] as const).map((l) => (
                              <button
                                key={l}
                                type="button"
                                onClick={() =>
                                  projectId &&
                                  selectedCharacterId &&
                                  updateSectionHeadingLevel(projectId, selectedCharacterId, section.id, l)
                                }
                                title={`Set as ${l.toUpperCase()}`}
                                className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
                                  level === l
                                    ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                                    : "text-dark-muted hover:text-dark-text hover:bg-dark-accent/30 border border-transparent"
                                }`}
                              >
                                {l.toUpperCase()}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleAddSection(section.id)}
                              className="p-1.5 text-dark-muted hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                              title="Add subsection (H2) under this section"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                projectId &&
                                selectedCharacterId &&
                                removeSection(projectId, selectedCharacterId, section.id)
                              }
                              className="p-1.5 text-dark-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                              title="Remove section"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {!collapsedSections.has(section.id) && (
                          <div className="px-3 pb-3 pt-1 space-y-3">
                            {blocks.map((block) => {
                              if (block.type === "note") {
                                return (
                                  <NoteBlockRow
                                    key={block.id}
                                    note={block}
                                    onUpdate={(content) =>
                                      projectId &&
                                      selectedCharacterId &&
                                      updateContentBlock(
                                        projectId,
                                        selectedCharacterId,
                                        section.id,
                                        block.id,
                                        { content }
                                      )
                                    }
                                    onRemove={() =>
                                      projectId &&
                                      selectedCharacterId &&
                                      removeContentBlock(projectId, selectedCharacterId, section.id, block.id)
                                    }
                                  />
                                );
                              }
                              if (block.type === "image") {
                                return (
                                  <ImageBlockRow
                                    key={block.id}
                                    block={block}
                                    onUpdate={(updates) =>
                                      projectId &&
                                      selectedCharacterId &&
                                      updateContentBlock(
                                        projectId,
                                        selectedCharacterId,
                                        section.id,
                                        block.id,
                                        updates
                                      )
                                    }
                                    onRemove={() =>
                                      projectId &&
                                      selectedCharacterId &&
                                      removeContentBlock(projectId, selectedCharacterId, section.id, block.id)
                                    }
                                  />
                                );
                              }
                              if (block.type === "attributes") {
                                const entries = getOrderedAttributeEntries(block);
                                return (
                                  <div key={block.id} className="space-y-1">
                                    {entries.length === 0 ? (
                                      <p className="text-dark-muted text-xs py-2 px-2">
                                        No attributes. Click + to add.
                                      </p>
                                    ) : (
                                      entries.map(([key, value]) => (
                                        <div
                                          key={key}
                                          className="flex items-center gap-2 py-2 border-b border-dark-accent/20 last:border-0"
                                        >
                                          <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
                                            {editingKeyBlockId === block.id && editingKey === key ? (
                                              <input
                                                type="text"
                                                value={draftKey}
                                                onChange={(e) => setDraftKey(e.target.value)}
                                                onBlur={() => handleSaveKeyEdit(section.id, block.id, key)}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") handleSaveKeyEdit(section.id, block.id, key);
                                                  if (e.key === "Escape") {
                                                    setEditingKey(null);
                                                    setEditingKeyBlockId(null);
                                                  }
                                                }}
                                                autoFocus
                                                placeholder="Attribute name"
                                                className="px-2 py-1.5 text-sm bg-dark-bg border border-blue-500 rounded text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-500"
                                              />
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setEditingKey(key);
                                                  setEditingKeyBlockId(block.id);
                                                  setDraftKey(key);
                                                }}
                                                className="text-left px-2 py-1.5 text-sm text-dark-text hover:bg-dark-accent/30 rounded truncate"
                                              >
                                                {key}
                                              </button>
                                            )}
                                            <input
                                              type="text"
                                              value={value}
                                              onChange={(e) => {
                                                if (projectId && selectedCharacterId) {
                                                  updateAttributeKey(
                                                    projectId,
                                                    selectedCharacterId,
                                                    section.id,
                                                    block.id,
                                                    key,
                                                    e.target.value
                                                  );
                                                }
                                              }}
                                              placeholder="Value"
                                              className="px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent rounded text-dark-text focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            />
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveAttributeKey(section.id, block.id, key)}
                                            className="p-1.5 text-dark-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                            title="Remove attribute"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                          </button>
                                        </div>
                                      ))
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        projectId &&
                                        selectedCharacterId &&
                                        addAttributeKey(projectId, selectedCharacterId, section.id, block.id)
                                      }
                                      className="text-xs text-dark-muted hover:text-dark-text flex items-center gap-1"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                      </svg>
                                      Add attribute
                                    </button>
                                  </div>
                                );
                              }
                              return null;
                            })}

                            <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-accent/20">
                              <button
                                type="button"
                                onClick={() =>
                                  projectId &&
                                  selectedCharacterId &&
                                  addContentBlock(projectId, selectedCharacterId, section.id, "note")
                                }
                                className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text hover:border-dark-accent transition-colors"
                              >
                                + Note
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  projectId &&
                                  selectedCharacterId &&
                                  addContentBlock(projectId, selectedCharacterId, section.id, "attributes")
                                }
                                className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text hover:border-dark-accent transition-colors"
                              >
                                + Attributes
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  projectId &&
                                  selectedCharacterId &&
                                  addContentBlock(projectId, selectedCharacterId, section.id, "image")
                                }
                                className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text hover:border-dark-accent transition-colors"
                              >
                                + Image
                              </button>
                            </div>
                          </div>
                        )}
                      </section>
                    </SortableSectionBlock>
                  );
                })}
              </SortableContext>
            )}
          </div>
        </DndContext>
      </div>
    </div>
  );
}
