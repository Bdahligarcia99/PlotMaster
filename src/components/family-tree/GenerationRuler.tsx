import { useState, useCallback } from "react";
import { useStore, useReactFlow } from "reactflow";
import {
  useFamilyTreeStore,
  formatGenerationAnchorLabel,
} from "../../store/familyTreeStore";
import type { GenerationAnchor } from "../../store/familyTreeStore";

export default function GenerationRuler() {
  const generationAnchors = useFamilyTreeStore((s) => s.generationAnchors);
  const showGenerationAnchors = useFamilyTreeStore((s) => s.showGenerationAnchors);
  const genLabelMode = useFamilyTreeStore((s) => s.genLabelMode);
  const updateGenerationAnchorLabel = useFamilyTreeStore((s) => s.updateGenerationAnchorLabel);
  const removeGenerationAnchor = useFamilyTreeStore((s) => s.removeGenerationAnchor);
  const editingAnchorIds = useFamilyTreeStore((s) => s.editingAnchorIds);
  const enterAnchorEditMode = useFamilyTreeStore((s) => s.enterAnchorEditMode);
  const confirmAnchor = useFamilyTreeStore((s) => s.confirmAnchor);
  const viewportBounds = useFamilyTreeStore((s) => s.viewportBounds);
  const { flowToScreenPosition } = useReactFlow();
  const domNode = useStore((s) => s.domNode);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = useCallback((anchor: GenerationAnchor) => {
    setEditingId(anchor.id);
    setEditValue(anchor.customLabel ?? "");
  }, []);

  const commitEdit = useCallback(() => {
    if (editingId) {
      updateGenerationAnchorLabel(editingId, editValue);
      setEditingId(null);
      setEditValue("");
    }
  }, [editingId, editValue, updateGenerationAnchorLabel]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue("");
  }, []);

  if (!showGenerationAnchors || generationAnchors.length === 0 || !domNode || !viewportBounds) return null;

  const rect = domNode.getBoundingClientRect();
  const rightEdgeX = viewportBounds.maxX;
  const sorted = [...generationAnchors].sort((a, b) => a.index - b.index);

  return (
    <div className="absolute top-0 bottom-0 right-0 w-44 pointer-events-none z-10">
      <div className="pointer-events-auto">
        {sorted.map((anchor) => {
          const centerY = anchor.yTop + anchor.height / 2;
          const flowPos = flowToScreenPosition({ x: rightEdgeX, y: centerY });
          const top = flowPos.y - rect.top - 10;

          const isEditing = editingAnchorIds.includes(anchor.id);
          return (
            <div
              key={anchor.id}
              className={`group absolute right-2 px-2 py-1.5 rounded text-xs font-mono font-medium bg-dark-surface/90 shadow flex flex-col gap-1.5 min-w-0 ${
                isEditing ? "border-2 border-blue-400/80" : "border border-dark-accent/50"
              }`}
              style={{
                top: Math.max(4, Math.min(rect.height - 80, top)),
                color: "rgba(59,130,246,0.85)",
              }}
            >
              <div className="flex items-center gap-1 min-w-0">
                {editingId === anchor.id ? (
                  <>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="flex-1 min-w-0 w-0 px-1 py-0.5 bg-dark-bg border border-dark-accent rounded text-dark-text text-xs"
                      autoFocus
                    />
                    {isEditing && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmAnchor(anchor.id);
                        }}
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/80 hover:bg-blue-500 text-white transition-colors"
                        title="Confirm position and restore node access"
                        aria-label="Confirm"
                      >
                        Confirm
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeGenerationAnchor(anchor.id);
                        setEditingId(null);
                        setEditValue("");
                      }}
                      className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/30 hover:text-red-400 text-dark-muted transition-colors"
                      title="Remove anchor"
                      aria-label="Remove anchor"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <div className="group flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => startEdit(anchor)}
                      className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity truncate"
                      style={{ color: "inherit" }}
                    >
                      {formatGenerationAnchorLabel(anchor, genLabelMode)}
                      {anchor.customLabel ? ` — ${anchor.customLabel}` : ""}
                    </button>
                    {isEditing ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmAnchor(anchor.id);
                        }}
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/80 hover:bg-blue-500 text-white transition-colors"
                        title="Confirm position and restore node access"
                        aria-label="Confirm"
                      >
                        Confirm
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          enterAnchorEditMode(anchor.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-dark-accent/50 hover:bg-dark-accent/70 text-dark-text transition-colors"
                        title="Edit position and size on canvas"
                        aria-label="Edit position"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeGenerationAnchor(anchor.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/30 hover:text-red-400 text-dark-muted transition-colors"
                      title="Remove anchor"
                      aria-label="Remove anchor"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
