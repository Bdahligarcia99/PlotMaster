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
    <div className="absolute top-0 bottom-0 right-0 w-28 pointer-events-none z-10">
      <div className="pointer-events-auto">
        {sorted.map((anchor) => {
          const centerY = anchor.yTop + anchor.height / 2;
          const flowPos = flowToScreenPosition({ x: rightEdgeX, y: centerY });
          const top = flowPos.y - rect.top - 10;

          return (
            <div
              key={anchor.id}
              className="absolute right-2 px-2 py-1 rounded text-xs font-mono font-medium bg-dark-surface/90 border border-dark-accent/50 shadow"
              style={{
                top: Math.max(4, Math.min(rect.height - 24, top)),
                color: "rgba(59,130,246,0.85)",
              }}
            >
              {editingId === anchor.id ? (
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  className="w-full min-w-[60px] px-1 py-0.5 bg-dark-bg border border-dark-accent rounded text-dark-text text-xs"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(anchor)}
                  className="text-left w-full hover:opacity-80 transition-opacity"
                  style={{ color: "inherit" }}
                >
                  {formatGenerationAnchorLabel(anchor, genLabelMode)}
                  {anchor.customLabel ? ` — ${anchor.customLabel}` : ""}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
