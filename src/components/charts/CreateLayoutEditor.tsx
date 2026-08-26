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
  useChartsStore,
  getOrderedSections,
  type ProfileSection,
  type AttributeBlock,
  type SectionHeadingLevel,
  type AttributeMetaItem,
} from "../../store/chartsStore";
import {
  addSectionToDraft,
  updateSectionInDraft,
  removeSectionFromDraft,
  addContentBlockToDraft,
  addAttributeToSectionInDraft,
  updateContentBlockInDraft,
  removeContentBlockFromDraft,
  reorderContentBlocksInDraft,
  updateAttributeMetaInDraft,
  removeAttributeKeyFromDraft,
  renameAttributeKeyInDraft,
} from "../../utils/chartSectionDraftHelpers";
import AttributeValueInput from "./AttributeValueInput";
import AttributeMetaEditorPopover from "./AttributeMetaEditorPopover";
import Button from "../ui/Button";
import NoteTextarea from "../ui/NoteTextarea";

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

function generateId() {
  return `_${Math.random().toString(36).slice(2, 11)}`;
}

export default function CreateLayoutEditor({ onClose }: { onClose: () => void }) {
  const { id: projectId } = useParams<{ id: string }>();
  const setChartLayoutMode = useChartsStore((s) => s.setChartLayoutMode);
  const createTemplateFromSections = useChartsStore((s) => s.createTemplateFromSections);
  const updateTemplate = useChartsStore((s) => s.updateTemplate);
  const listTemplates = useChartsStore((s) => s.listTemplates);
  const sections = useChartsStore((s) => s.createLayoutDraftSections);
  const setCreateLayoutDraftSections = useChartsStore((s) => s.setCreateLayoutDraftSections);
  const createLayoutDraftDataTypes = useChartsStore((s) => s.createLayoutDraftDataTypes);
  const setCreateLayoutDraftDataTypes = useChartsStore((s) => s.setCreateLayoutDraftDataTypes);
  const createLayoutDraftBuiltinDataTypes = useChartsStore((s) => s.createLayoutDraftBuiltinDataTypes);
  const editingTemplateId = useChartsStore((s) => s.editingTemplateId);
  const createLayoutDirty = useChartsStore((s) => s.createLayoutDirty);
  const chartSectionLayoutMode = useChartsStore((s) => s.chartSectionLayoutMode);

  const editingTemplateName = projectId && editingTemplateId
    ? listTemplates(projectId).find((t) => t.id === editingTemplateId)?.name
    : undefined;
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
  const orderedSections = getOrderedSections(sections);
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
  const h1Sections = visibleSections.filter((s) => s.parentId === null);
  const getDirectChildren = (parentId: string) => visibleSections.filter((s) => s.parentId === parentId);

  const getAddChildLabel = (level: SectionHeadingLevel): string | null => {
    const next = NEXT_LEVEL[level];
    return next ? `+${next.toUpperCase()}` : null;
  };

  const handleAddSection = (parentId?: string | null) => {
    setCreateLayoutDraftSections(addSectionToDraft(sections, parentId ?? null));
  };

  const handleSaveAsTemplate = () => {
    setSaveError(null);
    if (sections.length === 0) {
      setSaveError("Add at least one section before saving.");
      return;
    }
    const name = templateName.trim() || "Untitled";
    if (!projectId) return;
    const id = createTemplateFromSections(projectId, name, sections, createLayoutDraftDataTypes, createLayoutDraftBuiltinDataTypes);
    if (id) {
      setChartLayoutMode("fill");
      onClose();
    } else {
      setSaveError("Could not save template.");
    }
  };

  const handleSaveChanges = () => {
    if (!editingTemplateId) return;
    setSaveError(null);
    const pid = projectId ?? useChartsStore.getState().activeProjectId ?? "";
    if (!pid) {
      setSaveError("No project selected. Cannot save template.");
      return;
    }
    const ok = updateTemplate(pid, editingTemplateId);
    if (!ok) {
      setSaveError("Could not save template. Check the console for details.");
      return;
    }
    // Stay in editor; user clicks Close when done
  };

  const handleExit = () => {
    if (createLayoutDirty) {
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
      setCreateLayoutDraftSections(reorderContentBlocksInDraft(sections, section.id, fromIndex, toIndex));
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-dark-surface/30 overflow-hidden">
      <div className="p-4 border-b border-dark-accent/50 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
            {editingTemplateName ? `Editing: ${editingTemplateName}` : "New Layout"}
          </h2>
          <p className="text-dark-muted text-xs mt-1">Define structure only (sections, attributes, labels, images). No character data.</p>
          {saveError && editingTemplateId && (
            <p className="text-xs text-red-400 mt-2">{saveError}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleExit}>
            {createLayoutDirty ? "Cancel" : "Close"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleAddSection(null)} title="Add top-level section (H1)">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m7 7v-7" />
            </svg>
            +H1
          </Button>
          {editingTemplateId != null && (
            <Button variant="primary" size="sm" onClick={handleSaveChanges} disabled={!createLayoutDirty}>
              Save changes
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={() => setSaveModalOpen(true)}>
            Save as template
          </Button>
        </div>
      </div>

      <div className="p-4 overflow-y-auto">
        <div className={chartSectionLayoutMode === "grid" ? "w-full space-y-6" : "max-w-2xl space-y-6"}>
          {visibleSections.length === 0 ? (
            <p className="text-dark-muted text-sm py-4">No sections yet. Add a top-level section to start.</p>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleBlockDragEnd}>
            <div className="space-y-6">
              {h1Sections.map((section) => {
                const renderSectionWithChildren = (sec: ProfileSection): ReactNode => {
                  const lvl = (sec.headingLevel ?? "h1") as SectionHeadingLevel;
                  const lvlStyles: Record<SectionHeadingLevel, string> = { h1: "ml-0", h2: "ml-4", h3: "ml-8", h4: "ml-12" };
                  const nmStyles: Record<SectionHeadingLevel, string> = {
                    h1: "text-sm font-semibold uppercase tracking-wide",
                    h2: "text-sm font-medium",
                    h3: "text-xs font-medium",
                    h4: "text-xs font-normal text-dark-muted",
                  };
                  const blks = sec.contentBlocks ?? [];
                  const isCol = collapsedSections.has(sec.id);
                  const addLbl = getAddChildLabel(lvl);
                  const children = getDirectChildren(sec.id);
                  const useGrid = (sec.headingLevel === "h1") && chartSectionLayoutMode === "grid";

                  return (
                    <span key={sec.id} className="contents">
                      <section className={`border border-dark-accent/30 rounded-lg overflow-hidden bg-dark-bg/30 ${lvlStyles[lvl]}`}>
                        <div className="px-3 py-2 bg-dark-accent/20 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setCollapsedSections((prev) => { const n = new Set(prev); n.has(sec.id) ? n.delete(sec.id) : n.add(sec.id); return n; })}
                            className="p-0.5 text-dark-muted hover:text-dark-text"
                            title={isCol ? "Expand (show descendants)" : "Collapse (hide descendants)"}
                          >
                            <span className={isCol ? "" : "inline-block rotate-90"}>▶</span>
                          </button>
                          {editingSectionId === sec.id ? (
                            <input
                              type="text"
                              value={draftSectionLabel}
                              onChange={(e) => setDraftSectionLabel(e.target.value)}
                              onBlur={() => {
                                const trimmed = draftSectionLabel.trim() || "New section";
                                setCreateLayoutDraftSections(updateSectionInDraft(sections, sec.id, { label: trimmed }));
                                setEditingSectionId(null);
                              }}
                              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                              autoFocus
                              className={`flex-1 px-2 py-1 bg-dark-bg border border-blue-500 rounded ${nmStyles[lvl]}`}
                            />
                          ) : (
                            <button type="button" onClick={() => { setEditingSectionId(sec.id); setDraftSectionLabel(sec.label); }} className={`flex-1 text-left px-2 py-1 ${nmStyles[lvl]}`}>
                              {sec.label}
                            </button>
                          )}
                          <div className="flex gap-1">
                            {!isCol && addLbl && (
                              <button
                                type="button"
                                onClick={() => handleAddSection(sec.id)}
                                className="px-2 py-1 text-xs font-medium text-dark-muted hover:text-blue-400 rounded border border-dark-accent/40 hover:border-blue-500/50"
                                title={`Add ${addLbl.replace("+", "")} as child of this ${lvl.toUpperCase()}`}
                              >
                                {addLbl}
                              </button>
                            )}
                            <button type="button" onClick={() => setCreateLayoutDraftSections(removeSectionFromDraft(sections, sec.id))} className="p-1.5 text-dark-muted hover:text-red-400 rounded" title="Remove section and all descendants">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                        {!isCol && (
                          <SortableContext
                            items={blks.map((b) => `block-${b.id}`)}
                            strategy={verticalListSortingStrategy}
                          >
                          <div className="px-3 pb-3 pt-1 space-y-3">
                            {blks.map((block) => {
                          if (block.type === "note") {
                            const noteContent = block.content ?? "";
                            return (
                              <SortableContentBlock key={block.id} id={`block-${block.id}`} showDragHandle>
                                <div className="py-2 border-b border-dark-accent/20 flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <NoteTextarea
                                    value={noteContent}
                                    onChange={(v) => setCreateLayoutDraftSections(updateContentBlockInDraft(sections, sec.id, block.id, { content: v }))}
                                    placeholder="Label content…"
                                  />
                                </div>
                                <button type="button" onClick={() => setCreateLayoutDraftSections(removeContentBlockFromDraft(sections, sec.id, block.id))} className="p-1.5 text-dark-muted hover:text-red-400 rounded flex-shrink-0">
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
                                      onChange={(e) => setCreateLayoutDraftSections(updateContentBlockInDraft(sections, sec.id, block.id, { label: e.target.value }))}
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
                                  <button type="button" onClick={() => setCreateLayoutDraftSections(removeContentBlockFromDraft(sections, sec.id, block.id))} className="p-1.5 text-dark-muted hover:text-red-400 rounded flex-shrink-0">
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
                                          if (trimmed && trimmed !== key) setCreateLayoutDraftSections(renameAttributeKeyInDraft(sections, sec.id, block.id, key, trimmed));
                                          setEditingKey(null);
                                          setEditingKeyBlockId(null);
                                        }}
                                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                        autoFocus
                                        className="flex-1 px-2 py-1.5 text-sm bg-dark-bg border border-blue-500 rounded"
                                      />
                                    ) : (
                                      <>
                                        <span className="flex-1 px-2 py-1.5 text-sm text-dark-text truncate min-w-0">
                                          {key}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => { setEditingKey(key); setEditingKeyBlockId(block.id); setDraftKey(key); }}
                                          className="p-1.5 text-dark-muted hover:text-blue-400 rounded"
                                          title="Edit attribute name"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        </button>
                                      </>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <AttributeValueInput
                                        value={value}
                                        onChange={(v) => {
                                          const pairs = { ...(block.keyValuePairs ?? {}), [key]: v };
                                          setCreateLayoutDraftSections(updateContentBlockInDraft(sections, sec.id, block.id, { keyValuePairs: pairs }));
                                        }}
                                        meta={getAttributeMeta(block, key)}
                                        customDataTypes={createLayoutDraftDataTypes}
                                        inputId={`${block.id}-${key}`}
                                        placeholder="Value"
                                        className="w-full px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent/40 rounded text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-blue-500"
                                      />
                                    </div>
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
                                        customDataTypes={createLayoutDraftDataTypes}
                                        onAddCustomDataType={(name, options) => {
                                          const id = generateId();
                                          setCreateLayoutDraftDataTypes([...createLayoutDraftDataTypes, { id, name, options }]);
                                          return id;
                                        }}
                                        onSave={(m) => setCreateLayoutDraftSections(updateAttributeMetaInDraft(sections, sec.id, block.id, key, m))}
                                        onClose={() => setMetaEditorFor(null)}
                                        anchorRect={metaEditorAnchorRect}
                                      />
                                    )}
                                    <button type="button" onClick={() => setCreateLayoutDraftSections(removeAttributeKeyFromDraft(sections, sec.id, block.id, key))} className="p-1.5 text-dark-muted hover:text-red-400 rounded">
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
                          <button type="button" onClick={() => setCreateLayoutDraftSections(addContentBlockToDraft(sections, sec.id, "note"))} className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text" title="Add label">
                            Add Label
                          </button>
                          <button type="button" onClick={() => setCreateLayoutDraftSections(addAttributeToSectionInDraft(sections, sec.id))} className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text" title="Add attribute field">
                            Add Attribute Field
                          </button>
                          <button type="button" onClick={() => setCreateLayoutDraftSections(addContentBlockToDraft(sections, sec.id, "image"))} className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text" title="Add image container">
                            Add Image Container
                          </button>
                        </div>
                      </div>
                      </SortableContext>
                        )}
                      </section>
                      {!isCol && children.length > 0 && (
                        <div key={`children-${sec.id}`} className={useGrid ? "grid grid-cols-2 gap-4 items-start" : "space-y-6"}>
                          {children.map((child) => renderSectionWithChildren(child))}
                        </div>
                      )}
                    </span>
                  );
                };
                return renderSectionWithChildren(section);
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
            <h3 className="text-sm font-medium text-dark-text mb-2">
              {editingTemplateId ? "Discard changes?" : "Discard new layout?"}
            </h3>
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
