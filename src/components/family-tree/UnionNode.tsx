import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Handle, NodeToolbar, Position, type NodeProps } from "reactflow";
import type { UnionNodeData } from "../../store/familyTreeStore";
import { useFamilyTreeStore, DEFAULT_UNION_W, DEFAULT_UNION_H } from "../../store/familyTreeStore";
import UnionConnectionStyleEditor from "./UnionConnectionStyleEditor";

function UnionNode({ id, data, selected, xPos, yPos }: NodeProps<UnionNodeData>) {
  const [editorOpen, setEditorOpen] = useState(false);
  const showNodeInfoEnabled = useFamilyTreeStore((s) => s.showNodeInfoEnabled);
  const exportCaptureFlags = useFamilyTreeStore((s) => s.exportCaptureFlags);
  const showNotesForExport = exportCaptureFlags?.includeNotes && data.notes?.trim();
  const nodeInfoTopLeft = useFamilyTreeStore((s) => s.nodeInfoTopLeft);
  const nodeInfoCenter = useFamilyTreeStore((s) => s.nodeInfoCenter);
  const nodeInfoSize = useFamilyTreeStore((s) => s.nodeInfoSize);
  const setSelectedNodeIds = useFamilyTreeStore((s) => s.setSelectedNodeIds);
  const nodeSizesById = useFamilyTreeStore((s) => s.nodeSizesById);
  const reportNodeSize = useFamilyTreeStore((s) => s.reportNodeSize);
  const x = Math.round(xPos);
  const y = Math.round(yPos);

  const sizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sizeRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) reportNodeSize(id, { width: w, height: h });
    });
    observer.observe(el);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w > 0 && h > 0) reportNodeSize(id, { width: w, height: h });
    return () => observer.disconnect();
  }, [id, reportNodeSize]);

  const handleRootPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        setSelectedNodeIds((prev) => {
          if (prev.includes(id)) return prev.filter((x) => x !== id);
          return [...prev, id];
        });
      }
    },
    [id, setSelectedNodeIds]
  );

  const coordsOverlayClass =
    "absolute -top-1 right-0 translate-x-full px-1.5 py-1 text-xs font-mono text-dark-muted bg-dark-bg border border-dark-accent rounded shadow pointer-events-none z-40 whitespace-nowrap leading-tight";
  const size = nodeSizesById[id] ?? { width: DEFAULT_UNION_W, height: DEFAULT_UNION_H };
  const centerX = Math.round(x + size.width / 2);
  const centerY = Math.round(y + size.height / 2);
  const isBackward = data.unionType === "backward";

  return (
    <div className="relative group" onPointerDown={handleRootPointerDown}>
      {/* Node info overlay: only when enabled, lines based on node info toggles */}
      {showNodeInfoEnabled && (nodeInfoTopLeft || nodeInfoCenter || nodeInfoSize) && (
        <div className={coordsOverlayClass}>
          {nodeInfoTopLeft && <div>Top-Left: ({x}, {y})</div>}
          {nodeInfoCenter && <div>Center: ({centerX}, {centerY})</div>}
          {nodeInfoSize && <div>Size: {Math.round(size.width)}×{Math.round(size.height)}</div>}
        </div>
      )}

      <div
        ref={sizeRef}
        className={`relative px-3 py-2 rounded-lg border min-w-[60px] flex flex-col items-center justify-center transition-colors ${
          selected
            ? "bg-dark-accent/80 border-blue-500 shadow-md"
            : isBackward
              ? "bg-dark-accent/50 border-amber-500/70 hover:border-amber-500"
              : "bg-dark-accent/50 border-dark-accent hover:border-dark-muted"
        }`}
      >
        <button
          type="button"
          title="Edit connection style"
          onClick={(e) => {
            e.stopPropagation();
            setEditorOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-dark-surface border border-dark-accent text-dark-muted hover:text-dark-text hover:border-blue-500 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </button>
        <Handle type="target" position={Position.Top} id="leftPartner" style={{ left: "25%", transform: "translateX(-50%)" }} className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />
        <Handle type="target" position={Position.Top} id="rightPartner" style={{ left: "75%", transform: "translateX(-50%)" }} className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />
        <Handle type="source" position={Position.Bottom} id="children" className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />
        <span className="text-dark-muted text-xs font-medium" title={isBackward ? "Backward union (children → parents)" : undefined}>
          {isBackward ? "⇑" : "<=>"}
        </span>
        {showNotesForExport && (
          <span className="text-[10px] text-dark-muted mt-0.5 line-clamp-2 max-w-full break-words text-center">
            {data.notes.trim()}
          </span>
        )}
      </div>
      <NodeToolbar nodeId={id} isVisible={editorOpen} position={Position.Right} offset={12}>
        <UnionConnectionStyleEditor unionId={id} onClose={() => setEditorOpen(false)} />
      </NodeToolbar>
    </div>
  );
}

export default memo(UnionNode);
