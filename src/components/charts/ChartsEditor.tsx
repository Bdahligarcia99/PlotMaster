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
import AttributeValueInput from "./AttributeValueInput";
import AttributeMetaEditorPopover from "./AttributeMetaEditorPopover";
import CreateLayoutEditor from "./CreateLayoutEditor";
import ChartTemplatePicker from "./ChartTemplatePicker";
import {
  useChartsStore,
  getOrderedSections,
  type NoteBlock,
  type AttributeBlock,
  type ImageBlock,
  type ProfileSection,
  type SectionHeadingLevel,
  type AttributeMetaItem,
} from "../../store/chartsStore";
import {
  addSectionToDraft,
  updateSectionInDraft,
  removeSectionFromDraft,
  reorderSectionsInDraft,
  moveSectionToInDraft,
  addContentBlockToDraft,
  addAttributeToSectionInDraft,
  updateContentBlockInDraft,
  removeContentBlockFromDraft,
  reorderContentBlocksInDraft,
  removeAttributeKeyFromDraft,
  renameAttributeKeyInDraft,
  updateAttributeMetaInDraft,
} from "../../utils/chartSectionDraftHelpers";
import Button from "../ui/Button";
import NoteTextarea from "../ui/NoteTextarea";

function getOrderedAttributeEntries(block: AttributeBlock): [string, string][] {
  const pairs = block.keyValuePairs ?? {};
  const order = block.attributeOrder ?? Object.keys(pairs);
  return order
    .filter((k) => k in pairs)
    .map((k) => [k, pairs[k] ?? ""]);
}

function getAttributeMeta(block: AttributeBlock, key: string): AttributeMetaItem | undefined {
  return (block.attributeMeta ?? {})[key];
}

function generateId() {
  return `_${Math.random().toString(36).slice(2, 11)}`;
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
  readOnly,
}: {
  note: NoteBlock;
  onUpdate: (content: string) => void;
  onRemove?: () => void;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const content = note.content ?? "";

  return (
    <div className={`group flex gap-2 ${compact ? "py-1" : "py-2"}`}>
      <div className="flex-1 min-w-0">
        <NoteTextarea
          value={content}
          onChange={onUpdate}
          placeholder="Add a label or description..."
          compact={compact}
          readOnly={readOnly}
        />
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-dark-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors self-start"
          title="Remove label"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}

function ImageBlockRow({
  block,
  onUpdate,
  onRemove,
  allowUpload,
}: {
  block: ImageBlock;
  onUpdate: (updates: Partial<ImageBlock>) => void;
  onRemove?: () => void;
  /** When true (fill mode), show file picker and URL input for importing images */
  allowUpload?: boolean;
}) {
  const readFileAsDataUrl = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => onUpdate({ imageUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFileAsDataUrl(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!allowUpload) return;
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) readFileAsDataUrl(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (allowUpload) e.preventDefault();
  };

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
            {allowUpload ? (
              <>
                <div className="flex gap-2 flex-wrap">
                  <label className="px-3 py-1.5 text-xs font-medium rounded border border-dark-accent/50 text-dark-muted hover:text-dark-text hover:border-dark-accent cursor-pointer transition-colors">
                    Choose image…
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>
                  <input
                    type="text"
                    value={block.imageUrl && !block.imageUrl.startsWith("data:") ? block.imageUrl : ""}
                    onChange={(e) => onUpdate({ imageUrl: e.target.value })}
                    placeholder="Or paste image URL"
                    className="flex-1 min-w-[140px] px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent/40 rounded text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-blue-500"
                  />
                </div>
                {block.imageUrl ? (
                  <div className="mt-2 rounded overflow-hidden max-h-48 bg-dark-bg">
                    <img src={block.imageUrl} alt={block.label || "Image"} className="w-full object-contain" />
                    {allowUpload && (
                      <button
                        type="button"
                        onClick={() => onUpdate({ imageUrl: "" })}
                        className="mt-1 text-xs text-dark-muted hover:text-red-400"
                      >
                        Remove image
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className="flex flex-col items-center justify-center py-8 text-dark-muted text-xs border border-dark-accent/20 rounded bg-dark-bg/50 min-h-[100px] border-dashed"
                  >
                    <span>Drop image here or use file picker</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-dark-muted text-xs border border-dark-accent/20 rounded bg-dark-bg/50 min-h-[100px]">
                <span className="font-medium">Image</span>
                <span>{block.label ? `"${block.label}"` : "Container placeholder"}</span>
              </div>
            )}
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 text-dark-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
              title="Remove image block"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableSectionBlock({
  id,
  children,
  showDragHandle,
}: {
  id: string;
  children: React.ReactNode;
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

function SortableContentBlock({
  id,
  children,
  showDragHandle,
}: {
  id: string;
  children: React.ReactNode;
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

/** Read-only layout view for comparison mode – list layout only, no edit controls */
function CharacterLayoutReadOnlyView({
  characterName,
  sections,
}: {
  characterName: string;
  sections: ProfileSection[];
}) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const ordered = getOrderedSections(sections);
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const hasCollapsedAncestor = (id: string) => {
    let pid: string | null = sectionById.get(id)?.parentId ?? null;
    while (pid) {
      if (collapsedSections.has(pid)) return true;
      pid = sectionById.get(pid)?.parentId ?? null;
    }
    return false;
  };
  const visible = ordered.filter((s) => !hasCollapsedAncestor(s.id));
  const h1Sections = visible.filter((s) => s.parentId === null);
  const getChildren = (parentId: string) =>
    visible.filter((s) => s.parentId === parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const toggle = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const renderSection = (section: ProfileSection): React.ReactNode => {
    const level = (section.headingLevel ?? "h1") as SectionHeadingLevel;
    const levelStyles: Record<SectionHeadingLevel, string> = {
      h1: "ml-0",
      h2: "ml-4",
      h3: "ml-8",
      h4: "ml-12",
    };
    const nameStyles: Record<SectionHeadingLevel, string> = {
      h1: "text-sm font-semibold uppercase tracking-wide",
      h2: "text-sm font-medium",
      h3: "text-xs font-medium",
      h4: "text-xs font-normal text-dark-muted",
    };
    const blocks = section.contentBlocks ?? [];
    const isCol = collapsedSections.has(section.id);
    const children = getChildren(section.id);

    return (
      <React.Fragment key={section.id}>
        <section
          className={`border border-dark-accent/30 rounded-lg overflow-hidden bg-dark-bg/30 ${levelStyles[level]}`}
        >
          <div className="px-3 py-2 bg-dark-accent/20 flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggle(section.id)}
              className="p-0.5 text-dark-muted hover:text-dark-text"
              title={isCol ? "Expand" : "Collapse"}
            >
              <span className={isCol ? "" : "inline-block rotate-90"}>▶</span>
            </button>
            <span className={`flex-1 px-2 py-1 ${nameStyles[level]}`}>{section.label}</span>
          </div>
          {!isCol && (
            <div className="px-3 pb-3 pt-1 space-y-3">
              {blocks.map((block) => {
                if (block.type === "note") {
                  return (
                    <div key={block.id} className="py-2 border-b border-dark-accent/20 last:border-0">
                      <div className="text-sm text-dark-text whitespace-pre-wrap">{block.content ?? ""}</div>
                    </div>
                  );
                }
                if (block.type === "image") {
                  return (
                    <div key={block.id} className="py-2 border-b border-dark-accent/20 last:border-0">
                      <div className="text-xs text-dark-muted mb-1">{block.label || "Image"}</div>
                      {block.imageUrl ? (
                        <img
                          src={block.imageUrl}
                          alt={block.label || ""}
                          className="max-h-48 object-contain rounded"
                        />
                      ) : (
                        <div className="py-8 text-center text-dark-muted text-xs border border-dashed border-dark-accent/40 rounded">
                          Image placeholder
                        </div>
                      )}
                    </div>
                  );
                }
                if (block.type === "attributes") {
                  const entries = getOrderedAttributeEntries(block);
                  return (
                    <div key={block.id} className="space-y-1">
                      {entries.length === 0 ? (
                        <p className="text-dark-muted text-xs py-2">No attributes.</p>
                      ) : (
                        entries.map(([key, value]) => (
                          <div
                            key={key}
                            className="flex gap-2 py-2 border-b border-dark-accent/20 last:border-0"
                          >
                            <span className="px-2 py-1.5 text-sm text-dark-muted truncate">{key}</span>
                            <span className="flex-1 px-2 py-1.5 text-sm text-dark-text truncate">{value}</span>
                          </div>
                        ))
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}
        </section>
        {!isCol && children.length > 0 && (
          <div className="space-y-6">
            {children.map((c) => renderSection(c))}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-3 py-2 border-b border-dark-accent/50 bg-dark-accent/20">
        <h3 className="text-sm font-medium text-dark-text truncate">{characterName}</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl space-y-6">
          {h1Sections.length === 0 ? (
            <p className="text-dark-muted text-sm py-4">No sections.</p>
          ) : (
            h1Sections.map((h1) => renderSection(h1))
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChartsEditor() {
  const { id: projectId } = useParams<{ id: string }>();
  const characters = useChartsStore((s) => s.characters);
  const selectedCharacterId = useChartsStore((s) => s.selectedCharacterId);
  const comparisonCharacterId = useChartsStore((s) => s.comparisonCharacterId);
  const exitComparison = useChartsStore((s) => s.exitComparison);
  const updateSectionLabel = useChartsStore((s) => s.updateSectionLabel);
  const updateSectionHeadingLevel = useChartsStore((s) => s.updateSectionHeadingLevel);
  const removeSection = useChartsStore((s) => s.removeSection);
  const reorderSections = useChartsStore((s) => s.reorderSections);
  const moveSectionTo = useChartsStore((s) => s.moveSectionTo);
  const addContentBlock = useChartsStore((s) => s.addContentBlock);
  const addAttributeToSection = useChartsStore((s) => s.addAttributeToSection);
  const updateContentBlock = useChartsStore((s) => s.updateContentBlock);
  const reorderContentBlocks = useChartsStore((s) => s.reorderContentBlocks);
  const updateAttributeKey = useChartsStore((s) => s.updateAttributeKey);
  const renameAttributeKey = useChartsStore((s) => s.renameAttributeKey);
  const createTemplateFromSections = useChartsStore((s) => s.createTemplateFromSections);
  const saveTemplateFromCharacter = useChartsStore((s) => s.saveTemplateFromCharacter);
  const chartLayoutMode = useChartsStore((s) => s.chartLayoutMode);
  const setChartLayoutMode = useChartsStore((s) => s.setChartLayoutMode);
  const editLayoutDirty = useChartsStore((s) => s.editLayoutDirty);
  const editLayoutDraftSections = useChartsStore((s) => s.editLayoutDraftSections);
  const setEditLayoutDraftSections = useChartsStore((s) => s.setEditLayoutDraftSections);
  const editLayoutDraftDataTypes = useChartsStore((s) => s.editLayoutDraftDataTypes);
  const setEditLayoutDraftDataTypes = useChartsStore((s) => s.setEditLayoutDraftDataTypes);
  const applyEditLayoutDraftToCharacter = useChartsStore((s) => s.applyEditLayoutDraftToCharacter);
  const chartSectionLayoutMode = useChartsStore((s) => s.chartSectionLayoutMode);
  const unlinkCharacterFromTemplate = useChartsStore((s) => s.unlinkCharacterFromTemplate);
  const getTemplateById = useChartsStore((s) => s.getTemplateById);

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId);
  const linkedTemplate = projectId && selectedCharacter?.linkedTemplateId
    ? getTemplateById(projectId, selectedCharacter.linkedTemplateId)
    : null;
  const isLinked = Boolean(linkedTemplate);
  const canEditStructure = chartLayoutMode === "edit" && !isLinked;
  const isFillMode = chartLayoutMode === "fill";
  const hasLayout =
    (selectedCharacter?.sections?.length ?? 0) > 0 ||
    selectedCharacter?.linkedTemplateId != null;

  const sourceSections = canEditStructure
    ? editLayoutDraftSections
    : (selectedCharacter?.sections ?? []);
  const activeCustomDataTypes = canEditStructure
    ? editLayoutDraftDataTypes
    : (selectedCharacter?.customDataTypes ?? []);
  const sections = getOrderedSections(sourceSections);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [metaEditorFor, setMetaEditorFor] = useState<{ blockId: string; key: string } | null>(null);
  const [metaEditorAnchorRect, setMetaEditorAnchorRect] = useState<DOMRect | null>(null);
  const [editingKeyBlockId, setEditingKeyBlockId] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [draftSectionLabel, setDraftSectionLabel] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);

  const handleAddSection = (parentId?: string | null) => {
    if (!canEditStructure) return;
    setEditLayoutDraftSections(addSectionToDraft(sourceSections, parentId ?? null));
  };

  const handleSaveSectionEdit = (sectionId: string) => {
    const trimmed = draftSectionLabel.trim() || "New section";
    setEditingSectionId(null);
    if (canEditStructure) {
      setEditLayoutDraftSections(updateSectionInDraft(sourceSections, sectionId, { label: trimmed }));
    } else if (projectId && selectedCharacterId) {
      updateSectionLabel(projectId, selectedCharacterId, sectionId, trimmed);
    }
  };

  const handleSaveKeyEdit = (sectionId: string, blockId: string, oldKey: string) => {
    const trimmed = draftKey.trim();
    setEditingKey(null);
    setEditingKeyBlockId(null);
    if (!trimmed || trimmed === oldKey) return;
    if (canEditStructure) {
      setEditLayoutDraftSections(renameAttributeKeyInDraft(sourceSections, sectionId, blockId, oldKey, trimmed));
    } else if (projectId && selectedCharacterId) {
      renameAttributeKey(projectId, selectedCharacterId, sectionId, blockId, oldKey, trimmed);
    }
  };

  const handleRemoveAttributeKey = (sectionId: string, blockId: string, key: string) => {
    if (!canEditStructure) return;
    setEditLayoutDraftSections(removeAttributeKeyFromDraft(sourceSections, sectionId, blockId, key));
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

  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const hasCollapsedAncestor = (sectionId: string): boolean => {
    let id: string | null = sectionById.get(sectionId)?.parentId ?? null;
    while (id) {
      if (collapsedSections.has(id)) return true;
      id = sectionById.get(id)?.parentId ?? null;
    }
    return false;
  };
  const visibleSections = sections.filter((s) => !hasCollapsedAncestor(s.id));
  const h1Sections = sections.filter((s) => (s.parentId ?? null) === null);
  const getChildren = (parentId: string | null) =>
    visibleSections
      .filter((s) => (s.parentId ?? null) === parentId)
      .sort((a, b) => a.order - b.order);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
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
      if (canEditStructure) {
        const next = parentId !== overParentId
          ? moveSectionToInDraft(sourceSections, sectionId, overParentId, overSectionId)
          : (() => {
              const siblings = sourceSections.filter((s) => (s.parentId ?? null) === parentId);
              const sorted = [...siblings].sort((a, b) => a.order - b.order);
              const fromIndex = sorted.findIndex((s) => s.id === sectionId);
              const toIndex = sorted.findIndex((s) => s.id === overSectionId);
              if (fromIndex < 0 || toIndex < 0) return sourceSections;
              return reorderSectionsInDraft(sourceSections, parentId, fromIndex, toIndex);
            })();
        setEditLayoutDraftSections(next);
      } else if (projectId && selectedCharacterId) {
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
    } else if (activeId.startsWith("block-") && overId.startsWith("block-")) {
      const activeBlockId = activeId.replace("block-", "");
      const overBlockId = overId.replace("block-", "");
      const section = sections.find((s) => (s.contentBlocks ?? []).some((b) => b.id === activeBlockId));
      if (!section || activeBlockId === overBlockId) return;
      const blocks = section.contentBlocks ?? [];
      const fromIndex = blocks.findIndex((b) => b.id === activeBlockId);
      const toIndex = blocks.findIndex((b) => b.id === overBlockId);
      if (fromIndex < 0 || toIndex < 0) return;
      if (canEditStructure) {
        setEditLayoutDraftSections(reorderContentBlocksInDraft(sourceSections, section.id, fromIndex, toIndex));
      } else if (projectId && selectedCharacterId) {
        reorderContentBlocks(projectId, selectedCharacterId, section.id, fromIndex, toIndex);
      }
    }
  };

  if (chartLayoutMode === "createLayout") {
    return (
      <CreateLayoutEditor
        onClose={() => setChartLayoutMode("fill")}
      />
    );
  }

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

  const comparisonCharacter = comparisonCharacterId
    ? characters.find((c) => c.id === comparisonCharacterId)
    : null;
  const isComparisonMode = Boolean(comparisonCharacter);

  if (isComparisonMode && comparisonCharacter) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-dark-surface/30 overflow-hidden">
        <div className="flex-shrink-0 p-4 border-b border-dark-accent/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
              Comparing: {selectedCharacter.name} & {comparisonCharacter.name}
            </h2>
          </div>
          <Button variant="secondary" size="sm" onClick={exitComparison} title="Exit comparison view">
            Exit comparison
          </Button>
        </div>
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="flex-1 min-w-0 border-r border-dark-accent/50 overflow-hidden">
            <CharacterLayoutReadOnlyView
              characterName={selectedCharacter.name}
              sections={selectedCharacter.sections ?? []}
            />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <CharacterLayoutReadOnlyView
              characterName={comparisonCharacter.name}
              sections={comparisonCharacter.sections ?? []}
            />
          </div>
        </div>
      </div>
    );
  }

  const handleUnlink = () => {
    if (projectId && selectedCharacterId) {
      unlinkCharacterFromTemplate(projectId, selectedCharacterId);
      setUnlinkConfirmOpen(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-dark-surface/30 overflow-hidden">
      <div className="p-4 border-b border-dark-accent/50 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
              {selectedCharacter.name}
            </h2>
            {chartLayoutMode === "edit" && !isLinked && (
              <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded border border-amber-500/40">
                Edit layout
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLinked ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled
                  title={`Layout is linked to "${linkedTemplate?.name ?? ""}". Edit the template to change the layout.`}
                >
                  Edit layout
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setUnlinkConfirmOpen(true)}
                  title="Unlink and keep current layout"
                >
                  Unlink
                </Button>
              </>
            ) : isFillMode ? (
              hasLayout ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setChartLayoutMode("edit")}
                title="Edit layout structure"
              >
                Edit layout
              </Button>
              ) : null
            ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAddSection(null)}
                title="Add top-level section (H1)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m7 7v-7" />
                </svg>
                +H1
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (editLayoutDirty) setDiscardConfirmOpen(true);
                  else setChartLayoutMode("fill");
                }}
                title={editLayoutDirty ? "Discard changes and close" : "Close"}
              >
                {editLayoutDirty ? "Cancel" : "Close"}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (projectId && selectedCharacterId) {
                    applyEditLayoutDraftToCharacter(projectId, selectedCharacterId);
                  }
                }}
                disabled={!editLayoutDirty}
                title="Save layout changes to character"
              >
                Save changes
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSaveTemplateOpen(true)}
                title="Save layout as template"
              >
                Save as template
              </Button>
            </>
          )}
        </div>
        </div>
        {isLinked && (
          <div className="px-3 py-2 rounded border border-blue-500/40 bg-blue-500/10 text-blue-300 text-xs">
            Layout from &quot;{linkedTemplate?.name ?? "template"}&quot;. Edit the template to update this character.
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {!hasLayout && projectId && selectedCharacterId ? (
          <ChartTemplatePicker
            projectId={projectId}
            characterId={selectedCharacterId}
            characterName={selectedCharacter.name}
          />
        ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className={chartSectionLayoutMode === "grid" ? "w-full space-y-6" : "max-w-2xl space-y-6"}>
            {visibleSections.length === 0 ? (
              <p className="text-dark-muted text-sm py-4">
                No sections yet. Add a top-level section (H1) from the toolbar or the button above.
              </p>
            ) : (
              <SortableContext
                items={visibleSections.map((s) => `section-${s.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {h1Sections.map((h1) =>
                  (function renderSectionNode(section: ProfileSection): React.ReactNode {
                    const level = section.headingLevel ?? "h1";
                    const levelStyles: Record<SectionHeadingLevel, string> = {
                      h1: "ml-0",
                      h2: "ml-4",
                      h3: "ml-8",
                      h4: "ml-12",
                    };
                    const nameStyles: Record<SectionHeadingLevel, string> = {
                      h1: "text-sm font-semibold uppercase tracking-wide",
                      h2: "text-sm font-medium",
                      h3: "text-xs font-medium",
                      h4: "text-xs font-normal text-dark-muted",
                    };
                    const blocks = section.contentBlocks ?? [];

                    return (
                    <React.Fragment key={section.id}>
                    <SortableSectionBlock id={`section-${section.id}`} showDragHandle={canEditStructure}>
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
                          ) : canEditStructure ? (
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
                          ) : (
                            <span className={`flex-1 px-2 py-1 ${nameStyles[level]}`}>{section.label}</span>
                          )}
                          {canEditStructure && (
                          <div className="flex items-center gap-1">
                            {(["h1", "h2", "h3", "h4"] as const).map((l) => (
                              <button
                                key={l}
                                type="button"
                                onClick={() => {
                                  if (canEditStructure) {
                                    setEditLayoutDraftSections(updateSectionInDraft(sourceSections, section.id, { headingLevel: l }));
                                  } else if (projectId && selectedCharacterId) {
                                    updateSectionHeadingLevel(projectId, selectedCharacterId, section.id, l);
                                  }
                                }}
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
                          )}
                          {canEditStructure && (
                          <div className="flex items-center gap-1">
                            {!collapsedSections.has(section.id) && (level === "h1" || level === "h2" || level === "h3") && (
                              <button
                                type="button"
                                onClick={() => handleAddSection(section.id)}
                                className="px-2 py-1 text-xs font-medium text-dark-muted hover:text-blue-400 hover:bg-blue-500/10 rounded border border-dark-accent/40 hover:border-blue-500/50 transition-colors"
                                title={`Add ${level === "h1" ? "H2" : level === "h2" ? "H3" : "H4"} as child of this ${level.toUpperCase()}`}
                              >
                                {level === "h1" ? "+H2" : level === "h2" ? "+H3" : "+H4"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (canEditStructure) {
                                  setEditLayoutDraftSections(removeSectionFromDraft(sourceSections, section.id));
                                } else if (projectId && selectedCharacterId) {
                                  removeSection(projectId, selectedCharacterId, section.id);
                                }
                              }}
                              className="p-1.5 text-dark-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                              title="Remove section"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          )}
                        </div>

                        {!collapsedSections.has(section.id) && (
                          <SortableContext
                            items={blocks.map((b) => `block-${b.id}`)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="px-3 pb-3 pt-1 space-y-3">
                              {blocks.map((block) => {
                                if (block.type === "note") {
                                  return (
                                    <SortableContentBlock
                                      key={block.id}
                                      id={`block-${block.id}`}
                                      showDragHandle={canEditStructure}
                                    >
                                      <NoteBlockRow
                                        note={block}
                                        readOnly={isFillMode}
                                        onUpdate={(content) => {
                                          if (canEditStructure) {
                                            setEditLayoutDraftSections(updateContentBlockInDraft(sourceSections, section.id, block.id, { content }));
                                          } else if (projectId && selectedCharacterId) {
                                            updateContentBlock(projectId, selectedCharacterId, section.id, block.id, { content });
                                          }
                                        }}
                                        onRemove={canEditStructure ? () => setEditLayoutDraftSections(removeContentBlockFromDraft(sourceSections, section.id, block.id)) : undefined}
                                      />
                                    </SortableContentBlock>
                                  );
                                }
                                if (block.type === "image") {
                                  return (
                                    <SortableContentBlock
                                      key={block.id}
                                      id={`block-${block.id}`}
                                      showDragHandle={canEditStructure}
                                    >
                                      <ImageBlockRow
                                        block={block}
                                        allowUpload={isFillMode}
                                        onUpdate={(updates) => {
                                          if (canEditStructure) {
                                            setEditLayoutDraftSections(updateContentBlockInDraft(sourceSections, section.id, block.id, updates));
                                          } else if (projectId && selectedCharacterId) {
                                            updateContentBlock(projectId, selectedCharacterId, section.id, block.id, updates);
                                          }
                                        }}
                                        onRemove={canEditStructure ? () => setEditLayoutDraftSections(removeContentBlockFromDraft(sourceSections, section.id, block.id)) : undefined}
                                      />
                                    </SortableContentBlock>
                                  );
                                }
                                if (block.type === "attributes") {
                                  const entries = getOrderedAttributeEntries(block);
                                  return (
                                    <SortableContentBlock
                                      key={block.id}
                                      id={`block-${block.id}`}
                                      showDragHandle={canEditStructure}
                                    >
                                      <div className="space-y-1">
                                    {entries.length === 0 ? (
                                      <p className="text-dark-muted text-xs py-2 px-2">
                                        {canEditStructure ? "No attributes. Click Add Attribute Field below." : "No attributes."}
                                      </p>
                                    ) : (
                                      entries.map(([key, value]) => (
                                        <div
                                          key={key}
                                          className="flex items-center gap-2 py-2 border-b border-dark-accent/20 last:border-0"
                                        >
                                          <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
                                            {canEditStructure && editingKeyBlockId === block.id && editingKey === key ? (
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
                                            ) : canEditStructure ? (
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
                                            ) : (
                                              <span className="px-2 py-1.5 text-sm text-dark-text truncate">{key}</span>
                                            )}
                                            <div className="flex-1 min-w-0">
                                              <AttributeValueInput
                                                value={value}
                                                onChange={(v) => {
                                                  if (canEditStructure) {
                                                    const pairs = { ...(block.keyValuePairs ?? {}), [key]: v };
                                                    setEditLayoutDraftSections(updateContentBlockInDraft(sourceSections, section.id, block.id, { keyValuePairs: pairs }));
                                                  } else if (projectId && selectedCharacterId) {
                                                    updateAttributeKey(projectId, selectedCharacterId, section.id, block.id, key, v);
                                                  }
                                                }}
                                                customDataTypes={activeCustomDataTypes}
                                                meta={getAttributeMeta(block, key)}
                                                inputId={`${block.id}-${key}`}
                                                placeholder="Value"
                                                className="w-full px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent rounded text-dark-text focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                              />
                                            </div>
                                          </div>
                                          {canEditStructure && (
                                            <>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  const target = e.currentTarget;
                                                  const isOpen = metaEditorFor?.blockId === block.id && metaEditorFor?.key === key;
                                                  setMetaEditorFor(isOpen ? null : { blockId: block.id, key });
                                                  setMetaEditorAnchorRect(isOpen ? null : target.getBoundingClientRect());
                                                }}
                                                className="p-1.5 text-dark-muted hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                                title="Attribute type & options"
                                              >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                              </button>
                                              {metaEditorFor?.blockId === block.id && metaEditorFor?.key === key && (
                                                <AttributeMetaEditorPopover
                                                  keyName={key}
                                                  meta={getAttributeMeta(block, key)}
                                                  customDataTypes={editLayoutDraftDataTypes}
                                                  onAddCustomDataType={(name, options) => {
                                                    const id = generateId();
                                                    setEditLayoutDraftDataTypes([
                                                      ...editLayoutDraftDataTypes,
                                                      { id, name, options },
                                                    ]);
                                                    return id;
                                                  }}
                                                  onSave={(m) => {
                                                    setEditLayoutDraftSections(
                                                      updateAttributeMetaInDraft(sourceSections, section.id, block.id, key, m)
                                                    );
                                                  }}
                                                  onClose={() => setMetaEditorFor(null)}
                                                  anchorRect={metaEditorAnchorRect}
                                                />
                                              )}
                                            </>
                                          )}
                                          {canEditStructure && (
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
                                          )}
                                        </div>
                                      ))
                                    )}
                                      </div>
                                    </SortableContentBlock>
                                  );
                                }
                                return null;
                            })}

                            {canEditStructure && (
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-accent/20">
                              <button
                                type="button"
                                onClick={() => {
                                  if (canEditStructure) {
                                    setEditLayoutDraftSections(addContentBlockToDraft(sourceSections, section.id, "note"));
                                  } else if (projectId && selectedCharacterId) {
                                    addContentBlock(projectId, selectedCharacterId, section.id, "note");
                                  }
                                }}
                                className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text hover:border-dark-accent transition-colors"
                                title="Add label"
                              >
                                Add Label
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (canEditStructure) {
                                    setEditLayoutDraftSections(addAttributeToSectionInDraft(sourceSections, section.id));
                                  } else if (projectId && selectedCharacterId) {
                                    addAttributeToSection(projectId, selectedCharacterId, section.id);
                                  }
                                }}
                                className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text hover:border-dark-accent transition-colors"
                                title="Add attribute field"
                              >
                                Add Attribute Field
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (canEditStructure) {
                                    setEditLayoutDraftSections(addContentBlockToDraft(sourceSections, section.id, "image"));
                                  } else if (projectId && selectedCharacterId) {
                                    addContentBlock(projectId, selectedCharacterId, section.id, "image");
                                  }
                                }}
                                className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text hover:border-dark-accent transition-colors"
                                title="Add image container"
                              >
                                Add Image Container
                              </button>
                            </div>
                            )}
                            </div>
                          </SortableContext>
                        )}
                      </section>
                    </SortableSectionBlock>
                    {!collapsedSections.has(section.id) && (() => {
                      const children = getChildren(section.id);
                      if (children.length === 0) return null;
                      const useGrid = (section.headingLevel === "h1") && chartSectionLayoutMode === "grid";
                      return (
                        <div key={`children-${section.id}`} className={useGrid ? "grid grid-cols-2 gap-4 items-start" : "space-y-6"}>
                          {children.map((child) =>
                            renderSectionNode(child)
                          )}
                        </div>
                      );
                    })()}
                    </React.Fragment>
                    );
                  })(h1))}
              </SortableContext>
            )}
          </div>
        </DndContext>
        )}
      </div>

      {saveTemplateOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50"
          onClick={() => {
            setSaveTemplateOpen(false);
            setSaveTemplateError(null);
          }}
        >
          <div
            className="bg-dark-surface rounded-lg border border-dark-accent p-4 min-w-[300px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-dark-text mb-2">Save as template</h3>
            <input
              type="text"
              value={saveTemplateName}
              onChange={(e) => {
                setSaveTemplateName(e.target.value);
                setSaveTemplateError(null);
              }}
              placeholder="Template name"
              className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded mb-2 text-dark-text"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const secs = canEditStructure ? sourceSections : (selectedCharacter?.sections ?? []);
                  if (projectId && secs.length > 0) {
                    const name = saveTemplateName.trim() || "Untitled";
                    const id = canEditStructure
                      ? createTemplateFromSections(projectId, name, sourceSections, selectedCharacter?.customDataTypes ?? [])
                      : (selectedCharacterId ? saveTemplateFromCharacter(projectId, selectedCharacterId, name) : null);
                    if (id) {
                      setSaveTemplateOpen(false);
                      setSaveTemplateName("");
                      setSaveTemplateError(null);
                    } else {
                      setSaveTemplateError("Could not save template.");
                    }
                  } else {
                    setSaveTemplateError("Add at least one section before saving.");
                  }
                }
              }}
            />
            {saveTemplateError && <p className="text-xs text-red-400 mb-2">{saveTemplateError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSaveTemplateOpen(false);
                  setSaveTemplateError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setSaveTemplateError(null);
                  if (!projectId) return;
                  const secs = canEditStructure ? sourceSections : (selectedCharacter?.sections ?? []);
                  if (secs.length === 0) {
                    setSaveTemplateError("Add at least one section before saving.");
                    return;
                  }
                  const name = saveTemplateName.trim() || "Untitled";
                  const id = canEditStructure
                    ? createTemplateFromSections(projectId, name, sourceSections, selectedCharacter?.customDataTypes ?? [])
                    : (selectedCharacterId ? saveTemplateFromCharacter(projectId, selectedCharacterId, name) : null);
                  if (id) {
                    setSaveTemplateOpen(false);
                    setSaveTemplateName("");
                    setSaveTemplateError(null);
                  } else {
                    setSaveTemplateError("Could not save template.");
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {discardConfirmOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
          <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 max-w-sm mx-4 shadow-lg">
            <h3 className="text-sm font-medium text-dark-text mb-2">Discard layout changes?</h3>
            <p className="text-sm text-dark-muted mb-4">
              All unsaved layout changes will be lost. This cannot be undone. Do you want to proceed?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDiscardConfirmOpen(false)}>
                Keep editing
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setDiscardConfirmOpen(false);
                  setChartLayoutMode("fill");
                }}
              >
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}

      {unlinkConfirmOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
          <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 max-w-sm mx-4 shadow-lg">
            <h3 className="text-sm font-medium text-dark-text mb-2">Unlink from template?</h3>
            <p className="text-sm text-dark-muted mb-4">
              This character will keep its current layout but will no longer receive updates when the template changes. Continue?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setUnlinkConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleUnlink}>
                Unlink
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
