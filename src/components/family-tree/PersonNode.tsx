import { memo, useRef, useEffect, useCallback } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { PersonNodeData } from "../../store/familyTreeStore";
import { useFamilyTreeStore, DEFAULT_PERSON_W, DEFAULT_PERSON_H, getPersonDisplayName } from "../../store/familyTreeStore";

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
  const selectedNodeIds = useFamilyTreeStore((s) => s.selectedNodeIds);
  const requestRemoveConnection = useFamilyTreeStore((s) => s.requestRemoveConnection);
  const isAnchor = anchorNodeId === id;
  const reportNodeSize = useFamilyTreeStore((s) => s.reportNodeSize);
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const edges = useFamilyTreeStore((s) => s.edges);
  const nameRoleSuggestions = useFamilyTreeStore((s) => s.nameRoleSuggestions);
  const genInheritFlashByNodeId = useFamilyTreeStore((s) => s.genInheritFlashByNodeId);
  const exportCaptureFlags = useFamilyTreeStore((s) => s.exportCaptureFlags);
  const inheritFlash = genInheritFlashByNodeId[id];
  const showGenInheritFlash = !!inheritFlash;
  const showNotesForExport = exportCaptureFlags?.includeNotes && nodeData.notes?.trim();
  const inheritLabel = inheritFlash?.label ?? "";
  const isGenImmune = nodeData.isGenArmed === false;
  const isFamilyLocked = (data as { isFamilyLocked?: boolean }).isFamilyLocked;
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
  }, [id, reportNodeSize, nodeData.firstName, nodeData.middleName, nodeData.lastName, nodeData.name]);

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

  const displayName = getPersonDisplayName(nodeData, id, nodes);
  const firstNickname = nodeData.nicknames?.map((n) => (n || "").trim()).find((t) => t.length > 0);

  const hasSuggestions = nameRoleSuggestions.some((s) => s.nodeId === id);
  const hasUnknownRole = nodes.some((n) => {
    if ((n.data as { kind?: string })?.kind !== "union") return false;
    const d = n.data as { leftPartnerId?: string; rightPartnerId?: string; partnerIds?: (string | null)[]; leftPartnerRole?: string; rightPartnerRole?: string };
    const leftId = d.leftPartnerId ?? d.partnerIds?.[0];
    const rightId = d.rightPartnerId ?? d.partnerIds?.[1];
    if (leftId === id) return !d.leftPartnerRole;
    if (rightId === id) return !d.rightPartnerRole;
    return false;
  });
  const showAttentionBadge = hasSuggestions || hasUnknownRole;

  const coordsOverlayClass =
    "absolute -top-1 right-0 translate-x-full px-1.5 py-1 text-xs font-mono text-dark-muted bg-dark-bg border border-dark-accent rounded shadow pointer-events-none z-40 whitespace-nowrap leading-tight";
  const size = nodeSizesById[id] ?? { width: DEFAULT_PERSON_W, height: DEFAULT_PERSON_H };
  const centerX = Math.round(x + size.width / 2);
  const centerY = Math.round(y + size.height / 2);

  const parentUnionEdges = edges.filter(
    (e) => e.target === id && (e.data as { type?: string })?.type === "child"
  );
  const parentUnionId = parentUnionEdges[0]?.source ?? null;
  const partnerUnionEdges = edges.filter(
    (e) => e.source === id && (e.data as { type?: string })?.type === "partner"
  );
  const partnerUnionIds = partnerUnionEdges.map((e) => e.target);
  const selectedPartnerUnionId =
    partnerUnionIds.length >= 2
      ? partnerUnionIds.find((uid) => selectedNodeIds.includes(uid)) ?? null
      : partnerUnionIds[0] ?? null;
  const bottomUnlinkEnabled =
    partnerUnionIds.length === 1 ||
    (partnerUnionIds.length >= 2 && selectedPartnerUnionId != null);

  const unlinkButtonClass = (enabled: boolean) =>
    `absolute left-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-dark-surface border transition-opacity z-20 ${
      enabled
        ? "border-dark-accent text-dark-muted hover:text-dark-text hover:border-red-500 opacity-0 group-hover:opacity-100 cursor-pointer"
        : "border-dark-accent/40 text-dark-muted/40 opacity-0 group-hover:opacity-40 cursor-not-allowed"
    }`;

  const handleUnlinkParent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!parentUnionId) return;
    const err = requestRemoveConnection({
      kind: "childEdge",
      unionId: parentUnionId,
      personId: id,
    });
    if (err) alert(err);
  };

  const handleUnlinkPartner = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bottomUnlinkEnabled || !selectedPartnerUnionId) return;
    const err = requestRemoveConnection({
      kind: "partnerEdge",
      unionId: selectedPartnerUnionId,
      personId: id,
    });
    if (err) alert(err);
  };

  return (
    <div className="relative group" onPointerDown={handleRootPointerDown}>
      <button
        type="button"
        title={
          parentUnionId
            ? "Unlink from parent union"
            : "No parent union to unlink"
        }
        disabled={!parentUnionId}
        onClick={handleUnlinkParent}
        onPointerDown={(e) => e.stopPropagation()}
        className={`${unlinkButtonClass(!!parentUnionId)} -top-6`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
        </svg>
      </button>
      <button
        type="button"
        title={
          partnerUnionIds.length === 0
            ? "No partner union to unlink"
            : partnerUnionIds.length >= 2 && !selectedPartnerUnionId
              ? "Select a union below to unlink"
              : "Unlink from partner union"
        }
        disabled={!bottomUnlinkEnabled}
        onClick={handleUnlinkPartner}
        onPointerDown={(e) => e.stopPropagation()}
        className={`${unlinkButtonClass(bottomUnlinkEnabled)} -bottom-6`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
        </svg>
      </button>
      {/* Hover tooltip */}
      <div className={tooltipClass}>
        Click to select and edit in properties panel
      </div>

      {/* Node info overlay: only when enabled */}
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
            : isGenImmune
              ? "bg-dark-surface border-red-500/70 hover:border-red-500/90 shadow-[0_0_12px_rgba(239,68,68,0.4)]"
              : "bg-dark-surface border-dark-accent hover:border-dark-muted"
        } ${selected && isGenImmune ? "ring-1 ring-red-500/25 ring-offset-1 ring-offset-dark-bg" : ""} ${!selected && isFamilyLocked ? "ring-2 ring-amber-400/50 ring-offset-1" : ""} ${showGenInheritFlash ? "animate-pulse" : ""}`}
        style={showGenInheritFlash ? { outline: "2px solid rgba(59,130,246,0.6)", outlineOffset: 2 } : undefined}
      >
        {showGenInheritFlash && inheritLabel && (
          <div
            key={inheritFlash.token}
            className="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-1 text-xs font-medium text-blue-300 bg-blue-500/30 border border-blue-400/50 rounded-full whitespace-nowrap animate-gen-inherit-pill pointer-events-none z-50"
          >
            Gen {inheritLabel}
          </div>
        )}
        {isAnchor && (
          <div
            className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-500/80 border border-amber-400"
            title="Placement anchor"
          />
        )}
        {showAttentionBadge && (
          <div
            className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-amber-500/90 text-amber-950 text-[10px] font-bold border border-amber-400 shadow-sm pointer-events-none"
            title={hasSuggestions ? "Has pending suggestions" : "Role not set"}
          >
            !
          </div>
        )}
        {((): React.ReactNode => {
          const partnerEdges = edges.filter((e) => e.source === id && (e.data as { type?: string })?.type === "partner");
          const count = partnerEdges.length;
          if (count <= 1) {
            return <Handle type="source" position={Position.Bottom} id="partner" className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />;
          }
          return Array.from({ length: count }, (_, i) => {
            const pct = count === 1 ? 50 : (i + 1) / (count + 1) * 100;
            return (
              <Handle
                key={`partner-${i}`}
                type="source"
                position={Position.Bottom}
                id={`partner-${i}`}
                style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
                className="!w-2 !h-2 !bg-dark-muted !border-dark-accent"
              />
            );
          });
        })()}
        <Handle type="target" position={Position.Top} id="parent" className="!w-2 !h-2 !bg-dark-muted !border-dark-accent" />
        <div className="text-dark-text font-medium text-sm text-center">
          <div className="min-h-[1.25rem] flex flex-col items-center justify-center">
            <span>{displayName}</span>
            {firstNickname ? (
              <span className="text-xs text-dark-muted mt-0.5">
                ({firstNickname})
              </span>
            ) : null}
            {showNotesForExport && (
              <span className="text-xs text-dark-muted mt-0.5 line-clamp-2 max-w-full break-words text-center">
                {nodeData.notes.trim()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(PersonNode);
