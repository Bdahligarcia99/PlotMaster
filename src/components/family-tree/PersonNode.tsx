import { memo, useState, useRef, useCallback, useEffect } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { PersonNodeData } from "../../store/familyTreeStore";
import { useFamilyTreeStore, DEFAULT_PERSON_W, DEFAULT_PERSON_H } from "../../store/familyTreeStore";

const tooltipClass =
  "absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1.5 text-xs text-dark-muted bg-dark-surface border border-dark-accent rounded-lg shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 whitespace-nowrap";

function PersonNode({ id, data, selected, xPos, yPos }: NodeProps<PersonNodeData>) {
  const nodeData = data;
  const showNodeInfoEnabled = useFamilyTreeStore((s) => s.showNodeInfoEnabled);
  const nodeInfoTopLeft = useFamilyTreeStore((s) => s.nodeInfoTopLeft);
  const nodeInfoCenter = useFamilyTreeStore((s) => s.nodeInfoCenter);
  const nodeInfoSize = useFamilyTreeStore((s) => s.nodeInfoSize);
  const nodeSizesById = useFamilyTreeStore((s) => s.nodeSizesById);
  const anchorNodeId = useFamilyTreeStore((s) => s.anchorNodeId);
  const setSelectedNodeIds = useFamilyTreeStore((s) => s.setSelectedNodeIds);
  const isAnchor = anchorNodeId === id;
  const updateNodeName = useFamilyTreeStore((s) => s.updateNodeName);
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
  }, [id, reportNodeSize, nodeData.name]);

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commit = useCallback(() => {
    const name = draftName.trim() || "New Person";
    updateNodeName(id, name);
    setIsEditing(false);
  }, [id, draftName, updateNodeName]);

  const cancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setDraftName(nodeData.name || "New Person");
    setIsEditing(true);
  }, [nodeData.name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [commit, cancel]
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

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

  const displayName = nodeData.name || "New Person";

  const showTooltip = !isEditing;

  const coordsOverlayClass =
    "absolute -top-1 right-0 translate-x-full px-1.5 py-1 text-xs font-mono text-dark-muted bg-dark-bg border border-dark-accent rounded shadow pointer-events-none z-40 whitespace-nowrap leading-tight";
  const size = nodeSizesById[id] ?? { width: DEFAULT_PERSON_W, height: DEFAULT_PERSON_H };
  const centerX = Math.round(x + size.width / 2);
  const centerY = Math.round(y + size.height / 2);

  return (
    <div className="relative group" onPointerDown={handleRootPointerDown}>
      {/* Hover tooltip: rename hint only */}
      {showTooltip && (
        <div className={tooltipClass}>
          Double-click to rename
        </div>
      )}

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
        className={`px-4 py-3 rounded-xl border-2 min-w-[120px] transition-colors relative ${
          selected
            ? "bg-dark-surface border-blue-500 shadow-lg shadow-blue-500/20"
            : "bg-dark-surface border-dark-accent hover:border-dark-muted"
        }`}
      >
        {isAnchor && (
          <div
            className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-500/80 border border-amber-400"
            title="Placement anchor"
          />
        )}
        <Handle type="source" position={Position.Bottom} id="partner" className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />
        <Handle type="target" position={Position.Top} id="parent" className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />
        <div className="text-dark-text font-medium text-sm text-center">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              onPointerDown={handlePointerDown}
              onMouseDown={handleMouseDown}
              className="w-full px-2 py-0.5 bg-dark-bg border border-dark-accent rounded text-dark-text text-sm text-center focus:outline-none focus:border-blue-500"
            />
          ) : (
            <div
              onDoubleClick={handleDoubleClick}
              className="cursor-text min-h-[1.25rem] flex items-center justify-center"
            >
              {displayName}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(PersonNode);
