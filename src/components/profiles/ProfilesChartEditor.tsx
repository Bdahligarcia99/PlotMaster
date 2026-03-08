import React, { useState, useEffect, useRef } from "react";
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
import CreateLayoutEditor from "./CreateLayoutEditor";
import {
  useCharacterProfilesStore,
  getOrderedSections,
  type NoteBlock,
  type AttributeBlock,
  type ImageBlock,
  type SectionHeadingLevel,
  type AttributeMetaItem,
  type AttributeType,
} from "../../store/characterProfilesStore";
import Button from "../ui/Button";
import AutoResizeTextarea from "../ui/AutoResizeTextarea";

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

function AttributeValueInput({
  value,
  onChange,
  meta,
  inputId,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  meta?: AttributeMetaItem;
  inputId: string;
  placeholder?: string;
  className?: string;
}) {
  const type = meta?.type ?? "text";
  const options = meta?.options ?? [];
  const allowCustom = meta?.allowCustom ?? false;

  if (type === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  if (type === "select" && options.length > 0) {
    if (allowCustom) {
      return (
        <>
          <input
            list={`opts-${inputId}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={className}
          />
          <datalist id={`opts-${inputId}`}>
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </>
      );
    }
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        <option value="">{placeholder ?? "Select..."}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {value && !options.includes(value) && (
          <option value={value}>{value} (custom)</option>
        )}
      </select>
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

function AttributeMetaEditor({
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

  const handleSave = () => {
    const opts = optionsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    onSave({
      type,
      options: type === "select" ? opts : undefined,
      allowCustom: type === "select" ? allowCustom : undefined,
    });
    onClose();
  };

  const rect = anchorRect;
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      className="fixed z-[9999] rounded-lg border border-dark-accent bg-dark-surface shadow-xl p-3 min-w-[200px] max-w-[280px]"
      style={{
        top: rect ? rect.bottom + 4 : 0,
        left: rect ? rect.left : 0,
      }}
    >
      <div className="text-xs font-medium text-dark-muted mb-2">Attribute: {keyName}</div>
      <div className="space-y-2">
        <div>
          <label className="block text-[10px] text-dark-muted mb-0.5">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AttributeType)}
            className="w-full px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded"
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="select">Select</option>
          </select>
        </div>
        {type === "select" && (
          <>
            <div>
              <label className="block text-[10px] text-dark-muted mb-0.5">Options (one per line)</label>
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={3}
                placeholder={"Brown\nGreen\nBlue"}
                className="w-full px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded resize-y"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowCustom}
                onChange={(e) => setAllowCustom(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-dark-text">Allow custom values</span>
            </label>
          </>
        )}
      </div>
      <div className="flex justify-end gap-1 mt-2">
        <button type="button" onClick={onClose} className="px-2 py-1 text-xs text-dark-muted hover:text-dark-text">
          Cancel
        </button>
        <button type="button" onClick={handleSave} className="px-2 py-1 text-xs bg-blue-600 text-white rounded">
          Save
        </button>
      </div>
    </div>
  );
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

const NOTE_COLLAPSE_LINES = 4;
const NOTE_PREVIEW_LINES = 3;

function NoteBlockRow({
  note,
  onUpdate,
  onRemove,
  compact,
}: {
  note: NoteBlock;
  onUpdate: (content: string) => void;
  onRemove?: () => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = note.content ?? "";
  const lines = content.split("\n");
  const isLong = lines.length > NOTE_COLLAPSE_LINES;

  return (
    <div className={`group flex gap-2 ${compact ? "py-1" : "py-2"}`}>
      <div className="flex-1 min-w-0">
        <div className={isLong && !expanded ? "max-h-[6.5rem] overflow-y-auto" : undefined}>
          <AutoResizeTextarea
            value={content}
            onChange={onUpdate}
            onBlur={(e) => onUpdate(e.currentTarget.value)}
            placeholder="Add a note or description..."
            className={`w-full px-2 py-1.5 text-sm bg-dark-bg/50 border border-dark-accent/40 rounded text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 min-h-[3rem] ${
              compact ? "text-xs" : ""
            }`}
          />
        </div>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-1 text-xs text-blue-400 hover:text-blue-300"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
      {onRemove && (
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
  const addAttributeToSection = useCharacterProfilesStore((s) => s.addAttributeToSection);
  const updateContentBlock = useCharacterProfilesStore((s) => s.updateContentBlock);
  const removeContentBlock = useCharacterProfilesStore((s) => s.removeContentBlock);
  const reorderContentBlocks = useCharacterProfilesStore((s) => s.reorderContentBlocks);
  const updateAttributeKey = useCharacterProfilesStore((s) => s.updateAttributeKey);
  const removeAttributeKey = useCharacterProfilesStore((s) => s.removeAttributeKey);
  const renameAttributeKey = useCharacterProfilesStore((s) => s.renameAttributeKey);
  const updateAttributeMeta = useCharacterProfilesStore((s) => s.updateAttributeMeta);
  const saveTemplateFromCharacter = useCharacterProfilesStore((s) => s.saveTemplateFromCharacter);
  const chartLayoutMode = useCharacterProfilesStore((s) => s.chartLayoutMode);
  const setChartLayoutMode = useCharacterProfilesStore((s) => s.setChartLayoutMode);
  const setEditLayoutDirty = useCharacterProfilesStore((s) => s.setEditLayoutDirty);

  const canEditStructure = chartLayoutMode === "edit";
  const isFillMode = chartLayoutMode === "fill";

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

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId);
  const sections = selectedCharacter ? getOrderedSections(selectedCharacter.sections ?? []) : [];

  const handleAddSection = (parentId?: string | null) => {
    if (!projectId || !selectedCharacterId || !canEditStructure) return;
    addSection(projectId, selectedCharacterId, parentId ?? null);
    setEditLayoutDirty(true);
  };

  const handleSaveSectionEdit = (sectionId: string) => {
    if (!projectId || !selectedCharacterId) return;
    const trimmed = draftSectionLabel.trim() || "New section";
    updateSectionLabel(projectId, selectedCharacterId, sectionId, trimmed);
    setEditingSectionId(null);
    if (canEditStructure) setEditLayoutDirty(true);
  };

  const handleSaveKeyEdit = (sectionId: string, blockId: string, oldKey: string) => {
    if (!projectId || !selectedCharacterId) return;
    const trimmed = draftKey.trim();
    if (trimmed && trimmed !== oldKey) {
      renameAttributeKey(projectId, selectedCharacterId, sectionId, blockId, oldKey, trimmed);
      if (canEditStructure) setEditLayoutDirty(true);
    }
    setEditingKey(null);
    setEditingKeyBlockId(null);
  };

  const handleRemoveAttributeKey = (sectionId: string, blockId: string, key: string) => {
    if (!projectId || !selectedCharacterId || !canEditStructure) return;
    removeAttributeKey(projectId, selectedCharacterId, sectionId, blockId, key);
    setEditLayoutDirty(true);
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
        setEditLayoutDirty(true);
      } else {
        const siblings = sections.filter((s) => (s.parentId ?? null) === parentId);
        const fromIndex = siblings.findIndex((s) => s.id === sectionId);
        const toIndex = siblings.findIndex((s) => s.id === overSectionId);
        if (fromIndex >= 0 && toIndex >= 0) {
          reorderSections(projectId, selectedCharacterId, parentId, fromIndex, toIndex);
          setEditLayoutDirty(true);
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
      if (fromIndex >= 0 && toIndex >= 0) {
        reorderContentBlocks(projectId, selectedCharacterId, section.id, fromIndex, toIndex);
        setEditLayoutDirty(true);
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

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-dark-surface/30 overflow-hidden">
      <div className="p-4 border-b border-dark-accent/50 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
            {selectedCharacter.name}
          </h2>
          {chartLayoutMode === "edit" && (
            <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded border border-amber-500/40">
              Edit layout
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isFillMode ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setChartLayoutMode("edit")}
              title="Edit layout structure"
            >
              Edit layout
            </Button>
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
                onClick={() => setSaveTemplateOpen(true)}
                title="Save layout as template"
              >
                Save as template
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditLayoutDirty(false);
                  setChartLayoutMode("fill");
                }}
                title="Done editing layout"
              >
                Done
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="max-w-2xl space-y-6">
            {visibleSections.length === 0 ? (
              <p className="text-dark-muted text-sm py-4">
                No sections yet. Add a top-level section (H1) from the toolbar or the button above.
              </p>
            ) : (
              <SortableContext
                items={visibleSections.map((s) => `section-${s.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {visibleSections.map((section) => {
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
                    <SortableSectionBlock key={section.id} id={`section-${section.id}`} showDragHandle={canEditStructure}>
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
                                  if (projectId && selectedCharacterId) {
                                    updateSectionHeadingLevel(projectId, selectedCharacterId, section.id, l);
                                    setEditLayoutDirty(true);
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
                                if (projectId && selectedCharacterId) {
                                  removeSection(projectId, selectedCharacterId, section.id);
                                  setEditLayoutDirty(true);
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
                                        onRemove={canEditStructure ? () => {
                                          if (projectId && selectedCharacterId) {
                                            removeContentBlock(projectId, selectedCharacterId, section.id, block.id);
                                            setEditLayoutDirty(true);
                                          }
                                        } : undefined}
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
                                        onRemove={canEditStructure ? () => {
                                          if (projectId && selectedCharacterId) {
                                            removeContentBlock(projectId, selectedCharacterId, section.id, block.id);
                                            setEditLayoutDirty(true);
                                          }
                                        } : undefined}
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
                                        {canEditStructure ? "No attributes. Click + New attribute below." : "No attributes."}
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
                                                  if (projectId && selectedCharacterId) {
                                                    updateAttributeKey(
                                                      projectId,
                                                      selectedCharacterId,
                                                      section.id,
                                                      block.id,
                                                      key,
                                                      v
                                                    );
                                                  }
                                                }}
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
                                                <AttributeMetaEditor
                                                  keyName={key}
                                                  meta={getAttributeMeta(block, key)}
                                                  onSave={(m) => {
                                                    if (projectId && selectedCharacterId) {
                                                      updateAttributeMeta(
                                                        projectId,
                                                        selectedCharacterId,
                                                        section.id,
                                                        block.id,
                                                        key,
                                                        m
                                                      );
                                                      setEditLayoutDirty(true);
                                                    }
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
                                  if (projectId && selectedCharacterId) {
                                    addContentBlock(projectId, selectedCharacterId, section.id, "note");
                                    setEditLayoutDirty(true);
                                  }
                                }}
                                className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text hover:border-dark-accent transition-colors"
                                title="Add notes block with textarea"
                              >
                                Add notes
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (projectId && selectedCharacterId) {
                                    addAttributeToSection(projectId, selectedCharacterId, section.id);
                                    setEditLayoutDirty(true);
                                  }
                                }}
                                className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text hover:border-dark-accent transition-colors"
                                title="Add new attribute"
                              >
                                + New attribute
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (projectId && selectedCharacterId) {
                                    addContentBlock(projectId, selectedCharacterId, section.id, "image");
                                    setEditLayoutDirty(true);
                                  }
                                }}
                                className="text-xs px-2 py-1.5 rounded border border-dark-accent/40 text-dark-muted hover:text-dark-text hover:border-dark-accent transition-colors"
                              >
                                + Image
                              </button>
                            </div>
                            )}
                            </div>
                          </SortableContext>
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
                  if (projectId && selectedCharacterId && sections.length > 0) {
                    const name = saveTemplateName.trim() || "Untitled";
                    const id = saveTemplateFromCharacter(projectId, selectedCharacterId, name);
                    if (id) {
                      setSaveTemplateOpen(false);
                      setSaveTemplateName("");
                      setSaveTemplateError(null);
                      setEditLayoutDirty(false);
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
                  if (!projectId || !selectedCharacterId) return;
                  if (sections.length === 0) {
                    setSaveTemplateError("Add at least one section before saving.");
                    return;
                  }
                  const name = saveTemplateName.trim() || "Untitled";
                  const id = saveTemplateFromCharacter(projectId, selectedCharacterId, name);
                  if (id) {
                    setSaveTemplateOpen(false);
                    setSaveTemplateName("");
                    setSaveTemplateError(null);
                    setEditLayoutDirty(false);
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
    </div>
  );
}
