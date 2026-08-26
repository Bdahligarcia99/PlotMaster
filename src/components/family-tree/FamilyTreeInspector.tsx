import { useState, useEffect, useRef } from "react";
import type { Edge } from "reactflow";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { getDocumentRefsForNode } from "../../store/familyTreeDocumentHelpers";
import {
  useFamilyTreeStore,
  resolveUnionConnectionStyle,
  getConnectionStyleName,
  formatGenerationAnchorLabel,
  computeBranchMemberIds,
  getPersonDisplayName,
  getPersonNameParts,
  getUnionIdsForPerson,
  isChildEdge,
  findFamilyForNode,
  getEffectiveFamilyColor,
} from "../../store/familyTreeStore";
import type { PersonNodeData, UnionNodeData, ParentRole } from "../../store/familyTreeStore";
import Input from "../ui/Input";

function ParentsSection({
  personId,
  nodes,
  edges,
  onSelectParent,
}: {
  personId: string;
  nodes: { id: string; type?: string; data: unknown }[];
  edges: Edge[];
  onSelectParent: (id: string) => void;
}) {
  const parentUnionIds = edges
    .filter((e) => isChildEdge(e) && e.target === personId)
    .map((e) => e.source);

  const parentIds = new Set<string>();
  for (const unionId of parentUnionIds) {
    const unionNode = nodes.find((n) => n.id === unionId && n.type === "union");
    if (!unionNode) continue;
    const data = unionNode.data as UnionNodeData;
    const leftId = data.leftPartnerId ?? data.partnerIds?.[0];
    const rightId = data.rightPartnerId ?? data.partnerIds?.[1];
    [leftId, rightId].forEach((id) => { if (id) parentIds.add(id); });
  }

  if (parentIds.size === 0) return null;

  return (
    <div className="mb-4">
      <label className="block text-dark-muted text-sm mb-2">Parents</label>
      <div className="space-y-1">
        {Array.from(parentIds).map((id) => {
          const node = nodes.find((n) => n.id === id && n.type === "person");
          const name = node?.data ? getPersonDisplayName(node.data as PersonNodeData, id, nodes) : id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectParent(id)}
              className="block w-full text-left text-dark-text text-sm hover:text-blue-400 hover:underline"
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getSiblingsForPerson(
  personId: string,
  nodes: { id: string; type?: string; data: unknown }[],
  edges: Edge[]
): { id: string; displayName: string }[] {
  const parentUnionIds = edges
    .filter((e) => isChildEdge(e) && e.target === personId)
    .map((e) => e.source);

  const siblingIds = new Set<string>();
  for (const unionId of parentUnionIds) {
    const childIds = edges
      .filter((e) => isChildEdge(e) && e.source === unionId)
      .map((e) => e.target);
    childIds.forEach((id) => {
      if (id !== personId) siblingIds.add(id);
    });
  }

  return Array.from(siblingIds).map((id) => {
    const node = nodes.find((n) => n.id === id && n.type === "person") as { data?: unknown } | undefined;
    const displayName = node?.data ? getPersonDisplayName(node.data as PersonNodeData, id, nodes) : id;
    return { id, displayName };
  });
}

function SiblingsSection({
  personId,
  nodes,
  edges,
  onSelectSibling,
}: {
  personId: string;
  nodes: { id: string; type?: string; data: unknown }[];
  edges: Edge[];
  onSelectSibling: (id: string) => void;
}) {
  const siblings = getSiblingsForPerson(personId, nodes, edges);
  if (siblings.length === 0) return null;

  return (
    <div className="mb-4">
      <label className="block text-dark-muted text-sm mb-2">Siblings</label>
      <div className="space-y-1">
        {siblings.map(({ id, displayName }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelectSibling(id)}
            className="block w-full text-left text-dark-text text-sm hover:text-blue-400 hover:underline"
          >
            {displayName}
          </button>
        ))}
      </div>
    </div>
  );
}

function PartnersDisplay({
  nodes,
  unionData,
}: {
  nodes: { id: string; type?: string; data: unknown }[];
  unionData: UnionNodeData;
}) {
  const ids = unionData.leftPartnerId && unionData.rightPartnerId
    ? [unionData.leftPartnerId, unionData.rightPartnerId]
    : unionData.partnerIds ?? [];
  const names = ids.map((pid) => {
    const partner = nodes.find((n) => n.id === pid && n.type === "person");
    return partner?.data ? getPersonDisplayName(partner.data as PersonNodeData, pid ?? undefined, nodes) : String(pid ?? "");
  });
  const sep = unionData.leftPartnerId && unionData.rightPartnerId ? " \u2014 " : ", ";
  return <p className="text-dark-text text-sm">{names.join(sep) || "\u2014"}</p>;
}

function getSwapPartnersState(
  unionData: UnionNodeData,
  nodes: { id: string; type?: string }[]
): { canSwap: boolean; tooltip: string } {
  if (!unionData.leftPartnerId || !unionData.rightPartnerId) {
    return { canSwap: false, tooltip: "Partner order not yet set. Select this union and run Sort first." };
  }
  if (!unionData.partnerIds || unionData.partnerIds.length !== 2) {
    return { canSwap: false, tooltip: "Invalid union data." };
  }
  const leftExists = nodes.some((n) => n.id === unionData.leftPartnerId && n.type === "person");
  const rightExists = nodes.some((n) => n.id === unionData.rightPartnerId && n.type === "person");
  if (!leftExists || !rightExists) {
    return { canSwap: false, tooltip: "Partner nodes not found." };
  }
  return { canSwap: true, tooltip: "Swap partners" };
}

function UnionRoleControls({
  unionId,
  unionData,
  nodes,
  updateUnionPartnerRole,
}: {
  unionId: string;
  unionData: UnionNodeData;
  nodes: { id: string; type?: string; data: unknown }[];
  updateUnionPartnerRole: (unionId: string, slot: "left" | "right", role: ParentRole | null) => void;
}) {
  const leftId = unionData.leftPartnerId ?? unionData.partnerIds?.[0];
  const rightId = unionData.rightPartnerId ?? unionData.partnerIds?.[1];
  if (!leftId || !rightId) return null;
  const leftName = nodes.find((n) => n.id === leftId && n.type === "person")?.data
    ? getPersonDisplayName(nodes.find((n) => n.id === leftId)!.data as PersonNodeData, leftId, nodes)
    : "Left";
  const rightName = nodes.find((n) => n.id === rightId && n.type === "person")?.data
    ? getPersonDisplayName(nodes.find((n) => n.id === rightId)!.data as PersonNodeData, rightId, nodes)
    : "Right";
  const roleOpts: { value: string; label: string }[] = [
    { value: "", label: "Not set" },
    { value: "father", label: "Father" },
    { value: "mother", label: "Mother" },
  ];
  return (
    <div className="mb-4 space-y-2">
      <label className="block text-dark-muted text-sm mb-2">Parent roles</label>
      <div className="space-y-2">
        <div>
          <span className="block text-dark-muted text-xs mb-1">{leftName}</span>
          <select
            value={unionData.leftPartnerRole ?? ""}
            onChange={(e) =>
              updateUnionPartnerRole(unionId, "left", (e.target.value || null) as ParentRole | null)
            }
            className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500"
          >
            {roleOpts.map((o) => (
              <option key={o.value || "_"} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="block text-dark-muted text-xs mb-1">{rightName}</span>
          <select
            value={unionData.rightPartnerRole ?? ""}
            onChange={(e) =>
              updateUnionPartnerRole(unionId, "right", (e.target.value || null) as ParentRole | null)
            }
            className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500"
          >
            {roleOpts.map((o) => (
              <option key={o.value || "_"} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

type ParentUnionInfo = {
  unionId: string;
  unionNode: { id: string; data: unknown };
  slot: "left" | "right";
  otherPartnerId: string;
  otherPartnerName: string;
  children: { id: string; displayName: string }[];
};

function getParentUnionsForPerson(
  personId: string,
  nodes: { id: string; type?: string; data: unknown }[],
  edges: Edge[]
): ParentUnionInfo[] {
  const result: ParentUnionInfo[] = [];
  const unionNodes = nodes.filter((n) => n.type === "union");
  for (const unionNode of unionNodes) {
    const data = unionNode.data as UnionNodeData;
    const leftId = data.leftPartnerId ?? data.partnerIds?.[0];
    const rightId = data.rightPartnerId ?? data.partnerIds?.[1];
    if (personId === leftId && rightId) {
      const otherName = nodes.find((n) => n.id === rightId && n.type === "person")?.data
        ? getPersonDisplayName(nodes.find((n) => n.id === rightId)!.data as PersonNodeData, rightId, nodes)
        : "Partner";
      const childIds = edges
        .filter((e) => isChildEdge(e) && e.source === unionNode.id)
        .map((e) => e.target);
      const children = childIds.map((id) => {
        const childNode = nodes.find((n) => n.id === id && n.type === "person");
        const displayName = childNode?.data
          ? getPersonDisplayName(childNode.data as PersonNodeData, id, nodes)
          : id;
        return { id, displayName };
      });
      result.push({
        unionId: unionNode.id,
        unionNode,
        slot: "left",
        otherPartnerId: rightId,
        otherPartnerName: otherName,
        children,
      });
    } else if (personId === rightId && leftId) {
      const otherName = nodes.find((n) => n.id === leftId && n.type === "person")?.data
        ? getPersonDisplayName(nodes.find((n) => n.id === leftId)!.data as PersonNodeData, leftId, nodes)
        : "Partner";
      const childIds = edges
        .filter((e) => isChildEdge(e) && e.source === unionNode.id)
        .map((e) => e.target);
      const children = childIds.map((id) => {
        const childNode = nodes.find((n) => n.id === id && n.type === "person");
        const displayName = childNode?.data
          ? getPersonDisplayName(childNode.data as PersonNodeData, id, nodes)
          : id;
        return { id, displayName };
      });
      result.push({
        unionId: unionNode.id,
        unionNode,
        slot: "right",
        otherPartnerId: leftId,
        otherPartnerName: otherName,
        children,
      });
    }
  }
  return result;
}

/** Draggable child for moving between union blocks */
function DraggableChild({
  childId,
  fromUnionId,
  displayName,
  onSelect,
  onRemove,
}: {
  childId: string;
  fromUnionId: string;
  displayName: string;
  onSelect: (id: string) => void;
  onRemove?: (childId: string, displayName: string, e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `child-${childId}`,
    data: { childId, fromUnionId },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1 text-dark-text text-sm hover:text-blue-400 hover:underline ${isDragging ? "opacity-50" : ""} cursor-grab active:cursor-grabbing`}
    >
      <span className="text-dark-muted select-none" aria-hidden>⋮⋮</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSelect(childId); }}
        className="flex-1 text-left"
      >
        {displayName}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(childId, displayName, e); }}
          title="Remove from union"
          className="text-dark-muted hover:text-red-500 px-1 text-xs shrink-0"
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Droppable children list for a union block */
function DroppableChildrenList({
  unionId,
  children,
  onSelect,
  onRemove,
}: {
  unionId: string;
  children: { id: string; displayName: string }[];
  onSelect: (id: string) => void;
  onRemove?: (childId: string, displayName: string, e: React.MouseEvent) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: unionId });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[24px] space-y-1 rounded px-2 py-1 ${isOver ? "bg-blue-500/20 border border-dashed border-blue-500/50" : ""}`}
    >
      {children.map(({ id, displayName }) => (
        <DraggableChild
          key={id}
          childId={id}
          fromUnionId={unionId}
          displayName={displayName}
          onSelect={onSelect}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}


function SwapSidesSection({
  personId,
  nodes,
  edges,
  swapPersonUnionSides,
}: {
  personId: string;
  nodes: { id: string; type?: string; data: unknown }[];
  edges: Edge[];
  swapPersonUnionSides: (personId: string) => boolean;
}) {
  const parentUnions = getParentUnionsForPerson(personId, nodes, edges);
  if (parentUnions.length < 2) return null;
  return (
    <div className="mb-4">
      <label className="block text-dark-muted text-sm mb-2">Connections</label>
      <button
        type="button"
        onClick={() => swapPersonUnionSides(personId)}
        title="Swap which side each union connects from (left ↔ right)"
        className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent"
      >
        Swap Sides
      </button>
    </div>
  );
}

function OrphanWarningModal({
  open,
  displayName,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  displayName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" role="dialog" aria-modal aria-labelledby="orphan-warning-title">
      <div className="mx-4 max-w-sm rounded-lg border border-dark-accent bg-dark-surface p-4 shadow-xl">
        <h3 id="orphan-warning-title" className="text-sm font-medium text-dark-text mb-2">
          Remove from tree?
        </h3>
        <p className="text-dark-muted text-sm mb-4">
          If you remove {displayName} from this union, they belong to no other union and will be removed from the tree.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-dark-accent/50 hover:border-dark-accent text-dark-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-500 text-white"
          >
            Remove from tree
          </button>
        </div>
      </div>
    </div>
  );
}

/** Modal shown when removing a person from their only union (they will be orphaned and removed from tree). */



/** One block per union: Partners, Role, Children. Connections at bottom. */
function PersonUnionsSection({
  personId,
  nodes,
  edges,
  onSelectNode,
  updateUnionPartnerRole,
  swapPersonUnionSides,
  moveChildToUnion,
  requestRemoveConnection,
}: {
  personId: string;
  nodes: { id: string; type?: string; data: unknown }[];
  edges: Edge[];
  onSelectNode: (id: string) => void;
  updateUnionPartnerRole: (unionId: string, slot: "left" | "right", role: ParentRole | null) => void;
  swapPersonUnionSides: (personId: string) => boolean;
  moveChildToUnion: (childId: string, fromUnionId: string, toUnionId: string) => boolean;
  requestRemoveConnection: (target: import("../../store/familyTreeStore").RemoveConnectionTarget) => string | null;
}) {
  const parentUnions = getParentUnionsForPerson(personId, nodes, edges);
  if (parentUnions.length === 0) return null;

  const [orphanModal, setOrphanModal] = useState<{
    open: boolean;
    personId: string;
    displayName: string;
    unionId: string;
    kind: "partner" | "child";
  }>({ open: false, personId: "", displayName: "", unionId: "", kind: "partner" });

  const handleRemovePartner = (unionId: string, partnerId: string, displayName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const unionIds = getUnionIdsForPerson(partnerId, edges);
    if (unionIds.size <= 1) {
      setOrphanModal({ open: true, personId: partnerId, displayName, unionId, kind: "partner" });
    } else {
      const err = requestRemoveConnection({ kind: "partnerEdge", unionId, personId: partnerId });
      if (err) alert(err);
    }
  };

  const handleRemoveChild = (unionId: string, childId: string, displayName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const unionIds = getUnionIdsForPerson(childId, edges);
    if (unionIds.size <= 1) {
      setOrphanModal({ open: true, personId: childId, displayName, unionId, kind: "child" });
    } else {
      const err = requestRemoveConnection({ kind: "childEdge", unionId, personId: childId });
      if (err) alert(err);
    }
  };

  const confirmOrphanRemove = () => {
    const edgeTarget =
      orphanModal.kind === "partner"
        ? ({ kind: "partnerEdge" as const, unionId: orphanModal.unionId, personId: orphanModal.personId })
        : ({ kind: "childEdge" as const, unionId: orphanModal.unionId, personId: orphanModal.personId });
    const err = requestRemoveConnection(edgeTarget);
    if (err) {
      alert(err);
      return;
    }
    if (!useFamilyTreeStore.getState().pendingBloodlineWarning) {
      const personErr = requestRemoveConnection({ kind: "person", personId: orphanModal.personId });
      if (personErr) alert(personErr);
    }
    setOrphanModal((o) => ({ ...o, open: false }));
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current as { childId?: string; fromUnionId?: string } | undefined;
    if (!data?.childId || !data?.fromUnionId) return;
    const toUnionId = String(over.id);
    if (toUnionId === data.fromUnionId) return;
    moveChildToUnion(data.childId, data.fromUnionId, toUnionId);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {parentUnions.map((union) => (
          <div
            key={union.unionId}
            className="rounded-lg border border-dark-accent/40 bg-dark-bg/30 px-3 py-3"
          >
            <div className="space-y-2">
              <div>
                <label className="block text-dark-muted text-sm mb-1">Partners</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectNode(union.otherPartnerId)}
                    className="flex-1 text-left text-dark-text text-sm hover:text-blue-400 hover:underline"
                  >
                    {union.otherPartnerName}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleRemovePartner(union.unionId, union.otherPartnerId, union.otherPartnerName, e)}
                    title="Remove from union"
                    className="text-dark-muted hover:text-red-500 px-1 text-xs"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-dark-muted text-sm mb-1">Role</label>
                <span className="text-dark-muted text-xs block mb-0.5">With {union.otherPartnerName}</span>
                <select
                  value={((union.unionNode.data as UnionNodeData)[union.slot === "left" ? "leftPartnerRole" : "rightPartnerRole"] ?? "")}
                  onChange={(e) =>
                    updateUnionPartnerRole(union.unionId, union.slot, (e.target.value || null) as ParentRole | null)
                  }
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">Unassigned</option>
                  <option value="father">Father</option>
                  <option value="mother">Mother</option>
                </select>
              </div>
              <div>
                <label className="block text-dark-muted text-sm mb-1">Children</label>
                <DroppableChildrenList
                  unionId={union.unionId}
                  children={union.children}
                  onSelect={onSelectNode}
                  onRemove={(childId, displayName, e) => handleRemoveChild(union.unionId, childId, displayName, e)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <SwapSidesSection
          personId={personId}
          nodes={nodes}
          edges={edges}
          swapPersonUnionSides={swapPersonUnionSides}
        />
      </div>
      <OrphanWarningModal
        open={orphanModal.open}
        displayName={orphanModal.displayName}
        onConfirm={confirmOrphanRemove}
        onCancel={() => setOrphanModal((o) => ({ ...o, open: false }))}
      />
    </DndContext>
  );
}

function SwapPartnersButton({
  unionData,
  unionId,
  swapUnionPartners,
  nodes,
}: {
  unionData: UnionNodeData;
  unionId: string;
  swapUnionPartners: (id: string) => boolean;
  nodes: { id: string; type?: string }[];
}) {
  const { canSwap, tooltip } = getSwapPartnersState(unionData, nodes);
  const fullTooltip = canSwap ? "Swap left and right partner. Select this union and run Sort to reflow layout." : tooltip;
  return (
    <button
      type="button"
      disabled={!canSwap}
      onClick={() => swapUnionPartners(unionId)}
      title={fullTooltip}
      className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-dark-accent/50"
    >
      Swap Partners
    </button>
  );
}

function SwapUnionSidesButton({
  unionData,
  unionId,
  swapUnionHandleSides,
}: {
  unionData: UnionNodeData;
  unionId: string;
  swapUnionHandleSides: (id: string) => boolean;
}) {
  const leftId = unionData.leftPartnerId ?? unionData.partnerIds?.[0];
  const rightId = unionData.rightPartnerId ?? unionData.partnerIds?.[1];
  if (!leftId || !rightId) return null;
  return (
    <button
      type="button"
      onClick={() => swapUnionHandleSides(unionId)}
      title="Swap which side each partner's edge connects to (left ↔ right) to reduce crossings"
      className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent"
    >
      Swap Sides
    </button>
  );
}

function SwapPartnersIconButton({
  unionData,
  unionId,
  swapUnionPartners,
  nodes,
}: {
  unionData: UnionNodeData;
  unionId: string;
  swapUnionPartners: (id: string) => boolean;
  nodes: { id: string; type?: string }[];
}) {
  const { canSwap, tooltip } = getSwapPartnersState(unionData, nodes);
  return (
    <button
      type="button"
      disabled={!canSwap}
      onClick={() => swapUnionPartners(unionId)}
      title={tooltip}
      className="w-7 h-7 flex items-center justify-center rounded border border-dark-accent/50 hover:bg-dark-accent/20 hover:border-dark-accent text-dark-muted hover:text-dark-text cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span className="text-sm" aria-hidden="true">↔</span>
    </button>
  );
}

export default function FamilyTreeInspector() {
  const {
    nodes,
    edges,
    primarySelectedNodeId,
    setPersonAnchored,
    setSelectedNodeIds,
    updatePersonNameParts,
    updatePersonNicknames,
    updateNodeNotes,
    swapUnionPartners,
    swapUnionHandleSides,
    swapPersonUnionSides,
    updateUnionPartnerRole,
    moveChildToUnion,
    requestRemoveConnection,
    generationAnchors,
    genLabelMode,
    updateNodeGenAnchor,
    nameRoleSuggestions,
    setReviewNodesModalOpen,
  } = useFamilyTreeStore();
  const setUnionMainGraph = useFamilyTreeStore((s) => s.setUnionMainGraph);
  const setUnionName = useFamilyTreeStore((s) => s.setUnionName);
  const connectionStyles = useFamilyTreeStore((s) => s.connectionStyles);
  const families = useFamilyTreeStore((s) => s.families);
  const documents = useFamilyTreeStore((s) => s.documents);
  const inspectorFamilyId = useFamilyTreeStore((s) => s.inspectorFamilyId);
  const setFamilyCustomName = useFamilyTreeStore((s) => s.setFamilyCustomName);
  const setFamilyDescription = useFamilyTreeStore((s) => s.setFamilyDescription);
  const setFamilyNotes = useFamilyTreeStore((s) => s.setFamilyNotes);
  const setFamilyColor = useFamilyTreeStore((s) => s.setFamilyColor);
  const inspectorBranchId = useFamilyTreeStore((s) => s.inspectorBranchId);
  const branches = useFamilyTreeStore((s) => s.branches);
  const setBranchCustomName = useFamilyTreeStore((s) => s.setBranchCustomName);
  const setBranchDescription = useFamilyTreeStore((s) => s.setBranchDescription);
  const deleteBranch = useFamilyTreeStore((s) => s.deleteBranch);

  const inspectorFamily = inspectorFamilyId
    ? families.find((f) => f.id === inspectorFamilyId)
    : null;

  const inspectorBranch = inspectorBranchId
    ? branches.find((b) => b.id === inspectorBranchId)
    : null;

  const [branchNameDraft, setBranchNameDraft] = useState("");
  const [branchDescriptionDraft, setBranchDescriptionDraft] = useState("");
  const branchNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inspectorBranch) {
      setBranchNameDraft(inspectorBranch.name);
      setBranchDescriptionDraft(inspectorBranch.description ?? "");
      const t = setTimeout(() => {
        branchNameRef.current?.focus();
        branchNameRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [inspectorBranch?.id, inspectorBranch?.name, inspectorBranch?.description]);

  const [familyNameDraft, setFamilyNameDraft] = useState("");
  const [familyDescriptionDraft, setFamilyDescriptionDraft] = useState("");
  const [familyNotesDraft, setFamilyNotesDraft] = useState("");
  const familyNameRef = useRef<HTMLInputElement>(null);
  const [unionNameDraft, setUnionNameDraft] = useState("");
  const unionNameRef = useRef<HTMLInputElement>(null);
  const [crownReassignTarget, setCrownReassignTarget] = useState<string | null>(null);

  useEffect(() => {
    if (inspectorFamily) {
      setFamilyNameDraft(inspectorFamily.name);
      setFamilyDescriptionDraft(inspectorFamily.description ?? "");
      setFamilyNotesDraft(inspectorFamily.notes ?? "");
      const t = setTimeout(() => {
        familyNameRef.current?.focus();
        familyNameRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [inspectorFamily?.id, inspectorFamily?.name, inspectorFamily?.description, inspectorFamily?.notes]);

  const selectedNode = !inspectorFamily && !inspectorBranch && primarySelectedNodeId
    ? nodes.find((n) => n.id === primarySelectedNodeId)
    : null;

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nicknamesInput, setNicknamesInput] = useState("");

  const firstRef = useRef<HTMLInputElement>(null);
  const middleRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);
  const nicknamesRef = useRef<HTMLInputElement>(null);

  const refs = [firstRef, middleRef, lastRef, nicknamesRef];

  useEffect(() => {
    if (selectedNode && (selectedNode.data as { kind?: string }).kind === "person") {
      const d = selectedNode.data as PersonNodeData;
      const parts = getPersonNameParts(d);
      setFirstName(parts.first);
      setMiddleName(parts.middle);
      setLastName(parts.last);
      const nicks = d.nicknames ?? [];
      setNicknamesInput(nicks.join(", "));
    }
  }, [selectedNode?.id, (selectedNode?.data as PersonNodeData)?.firstName, (selectedNode?.data as PersonNodeData)?.middleName, (selectedNode?.data as PersonNodeData)?.lastName, (selectedNode?.data as PersonNodeData)?.name, (selectedNode?.data as PersonNodeData)?.nicknames]);

  useEffect(() => {
    if (selectedNode && (selectedNode.data as { kind?: string }).kind === "person") {
      firstRef.current?.focus();
    }
  }, [selectedNode?.id]);

  useEffect(() => {
    if (selectedNode && (selectedNode.data as { kind?: string }).kind === "union") {
      setUnionNameDraft((selectedNode.data as UnionNodeData).name ?? "");
    }
  }, [selectedNode?.id, (selectedNode?.data as UnionNodeData)?.name]);

  const saveNameParts = () => {
    if (selectedNode && (selectedNode.data as { kind?: string }).kind === "person") {
      updatePersonNameParts(selectedNode.id, { firstName, middleName, lastName });
    }
  };

  const saveNicknames = () => {
    if (selectedNode && (selectedNode.data as { kind?: string }).kind === "person") {
      const parsed = nicknamesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      updatePersonNicknames(selectedNode.id, parsed);
    }
  };

  const makeTabHandler = (index: number, shift: boolean) => (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const n = 4;
    const nextIndex = shift ? (index - 1 + n) % n : (index + 1) % n;
    refs[nextIndex]?.current?.focus();
  };

  const handleSetMainGraphClick = (unionId: string) => {
    const owner = findFamilyForNode(unionId, families);
    const hasOtherCrown = owner?.unionIds.some(
      (uid) =>
        uid !== unionId &&
        (nodes.find((n) => n.id === uid)?.data as UnionNodeData)?.isMainGraph
    );
    if (hasOtherCrown) setCrownReassignTarget(unionId);
    else setUnionMainGraph(unionId, true);
  };

  if (inspectorBranch) {
    const memberIds = computeBranchMemberIds(inspectorBranch.rootPersonId, nodes, edges);
    const anchorIndices: number[] = [];
    for (const nodeId of memberIds) {
      const personNode = nodes.find((n) => n.id === nodeId);
      if (!personNode || (personNode.data as { kind?: string }).kind !== "person") continue;
      const genAnchorId = (personNode.data as PersonNodeData).genAnchorId;
      if (!genAnchorId) continue;
      const anchor = generationAnchors.find((a) => a.id === genAnchorId);
      if (anchor != null) anchorIndices.push(anchor.index);
    }
    let genRangeLabel = "—";
    if (anchorIndices.length > 0) {
      const minIdx = Math.min(...anchorIndices);
      const maxIdx = Math.max(...anchorIndices);
      const minAnchor = generationAnchors.find((a) => a.index === minIdx);
      const maxAnchor = generationAnchors.find((a) => a.index === maxIdx);
      if (minAnchor && maxAnchor) {
        const minLabel = formatGenerationAnchorLabel(minAnchor, genLabelMode);
        const maxLabel = formatGenerationAnchorLabel(maxAnchor, genLabelMode);
        genRangeLabel = minIdx === maxIdx ? minLabel : `${minLabel} to ${maxLabel}`;
      }
    }

    return (
      <div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto">
        <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide mb-3">
          Inspector — Branch
        </h3>
        <div className="mb-4">
          <label className="block text-dark-muted text-sm mb-2">Name</label>
          <input
            ref={branchNameRef}
            type="text"
            value={branchNameDraft}
            onChange={(e) => setBranchNameDraft(e.target.value)}
            onBlur={() => setBranchCustomName(inspectorBranch.id, branchNameDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setBranchCustomName(inspectorBranch.id, branchNameDraft);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="mb-4">
          <label className="block text-dark-muted text-sm mb-2">Description</label>
          <textarea
            value={branchDescriptionDraft}
            onChange={(e) => setBranchDescriptionDraft(e.target.value)}
            onBlur={() => setBranchDescription(inspectorBranch.id, branchDescriptionDraft)}
            className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm resize-y min-h-[80px] focus:outline-none focus:border-blue-500"
            placeholder="Branch description..."
          />
        </div>
        <div className="mb-3">
          <label className="block text-dark-muted text-sm mb-1">Location</label>
          <div className="text-dark-text text-sm">
            {inspectorBranch.mode === "tab" ? "On its own branch tab" : "Hidden on main canvas"}
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-dark-muted text-sm mb-1">Generations</label>
          <div className="text-dark-text text-sm">{genRangeLabel}</div>
        </div>
        <div className="mb-4">
          <label className="block text-dark-muted text-sm mb-1">Nodes involved</label>
          <div className="text-dark-text text-sm">{memberIds.length}</div>
        </div>
        <button
          type="button"
          onClick={() => deleteBranch(inspectorBranch.id)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Delete Branch
        </button>
      </div>
    );
  }

  if (inspectorFamily) {
    const styleCounts = new Map<string, number>();
    for (const unionId of inspectorFamily.unionIds) {
      const unionNode = nodes.find((n) => n.id === unionId);
      if (!unionNode || (unionNode.data as { kind?: string }).kind !== "union") continue;
      const styleName = getConnectionStyleName(unionNode.data as UnionNodeData, connectionStyles);
      styleCounts.set(styleName, (styleCounts.get(styleName) ?? 0) + 1);
    }

    const anchorIndices: number[] = [];
    for (const personId of inspectorFamily.memberPersonIds) {
      const personNode = nodes.find((n) => n.id === personId);
      if (!personNode || (personNode.data as { kind?: string }).kind !== "person") continue;
      const genAnchorId = (personNode.data as PersonNodeData).genAnchorId;
      if (!genAnchorId) continue;
      const anchor = generationAnchors.find((a) => a.id === genAnchorId);
      if (anchor != null) anchorIndices.push(anchor.index);
    }
    let genRangeLabel = "—";
    if (anchorIndices.length > 0) {
      const minIdx = Math.min(...anchorIndices);
      const maxIdx = Math.max(...anchorIndices);
      const minAnchor = generationAnchors.find((a) => a.index === minIdx);
      const maxAnchor = generationAnchors.find((a) => a.index === maxIdx);
      if (minAnchor && maxAnchor) {
        const minLabel = formatGenerationAnchorLabel(minAnchor, genLabelMode);
        const maxLabel = formatGenerationAnchorLabel(maxAnchor, genLabelMode);
        genRangeLabel = minIdx === maxIdx ? minLabel : `${minLabel} to ${maxLabel}`;
      }
    }

    return (
      <div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto">
        <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide mb-3">
          Inspector — Family
        </h3>
        <div className="mb-4">
          <label className="block text-dark-muted text-sm mb-2">Name</label>
          <input
            ref={familyNameRef}
            type="text"
            value={familyNameDraft}
            onChange={(e) => setFamilyNameDraft(e.target.value)}
            onBlur={() => setFamilyCustomName(inspectorFamily.id, familyNameDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setFamilyCustomName(inspectorFamily.id, familyNameDraft);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="mb-4">
          <label className="block text-dark-muted text-sm mb-2">Description</label>
          <textarea
            value={familyDescriptionDraft}
            onChange={(e) => setFamilyDescriptionDraft(e.target.value)}
            onBlur={() => setFamilyDescription(inspectorFamily.id, familyDescriptionDraft)}
            className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm resize-y min-h-[80px] focus:outline-none focus:border-blue-500"
            placeholder="Family description..."
          />
        </div>
        <div className="mb-4">
          <label className="block text-dark-muted text-sm mb-2">Notes</label>
          <textarea
            value={familyNotesDraft}
            onChange={(e) => setFamilyNotesDraft(e.target.value)}
            onBlur={() => setFamilyNotes(inspectorFamily.id, familyNotesDraft)}
            className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm resize-y min-h-[60px] focus:outline-none focus:border-blue-500"
            placeholder="Family notes..."
          />
        </div>
        <div className="mb-4">
          <label className="block text-dark-muted text-sm mb-2">Family nodes color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={getEffectiveFamilyColor(
                inspectorFamily,
                families.findIndex((f) => f.id === inspectorFamily.id)
              )}
              onChange={(e) => setFamilyColor(inspectorFamily.id, e.target.value)}
              className="w-9 h-9 rounded border border-dark-accent bg-dark-bg cursor-pointer"
            />
            {inspectorFamily.color && (
              <button
                type="button"
                onClick={() => setFamilyColor(inspectorFamily.id, undefined)}
                className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent"
              >
                Reset to auto
              </button>
            )}
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-dark-muted text-sm mb-1">Number of nodes</label>
          <div className="text-dark-text text-sm">
            {inspectorFamily.unionIds.length + inspectorFamily.memberPersonIds.length}
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-dark-muted text-sm mb-1">Gen Range</label>
          <div className="text-dark-text text-sm">{genRangeLabel}</div>
        </div>
        <div className="mb-4">
          <label className="block text-dark-muted text-sm mb-2">Connection styles present</label>
          {styleCounts.size === 0 ? (
            <div className="text-dark-muted text-sm">—</div>
          ) : (
            <ul className="text-dark-text text-sm space-y-1">
              {[...styleCounts.entries()].map(([name, count]) => (
                <li key={name}>
                  {name}: {count}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (!selectedNode) {
    return (
      <div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto">
        <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide mb-3">
          Inspector
        </h3>
        <p className="text-dark-muted text-xs">Select a node to edit properties.</p>
      </div>
    );
  }

  const nodeData = selectedNode.data;

  return (
    <div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide flex-1">
          Inspector — {nodeData.kind === "person" ? "Person" : "Union"}
        </h3>
        {nodeData.kind === "union" && (
          <SwapPartnersIconButton
            unionData={nodeData as UnionNodeData}
            unionId={selectedNode.id}
            swapUnionPartners={swapUnionPartners}
            nodes={nodes}
          />
        )}
      </div>
      <p className="text-dark-muted text-xs mb-3 font-mono">{selectedNode.id}</p>
      {(() => {
        const refs = getDocumentRefsForNode(selectedNode.id, documents);
        if (!refs.declaredIn && refs.referencedIn.length === 0) return null;
        return (
          <div className="mb-4 text-xs text-dark-muted space-y-1">
            {refs.declaredIn ? (
              <p>
                <span className="text-dark-muted">Declared in:</span>{" "}
                <span className="text-dark-text">{refs.declaredIn}</span>
              </p>
            ) : null}
            {refs.referencedIn.length > 0 ? (
              <p>
                <span className="text-dark-muted">Referenced in:</span>{" "}
                <span className="text-dark-text">{refs.referencedIn.join(", ")}</span>
              </p>
            ) : null}
          </div>
        );
      })()}

      {nodeData.kind === "person" ? (
        <>
          {(() => {
            const suggestionsForNode = nameRoleSuggestions.filter((s) => s.nodeId === selectedNode.id);
            const parentUnions = getParentUnionsForPerson(selectedNode.id, nodes, edges);
            const hasUnresolvedRole = parentUnions.some((pu) => {
              const d = pu.unionNode.data as UnionNodeData;
              return !(pu.slot === "left" ? d.leftPartnerRole : d.rightPartnerRole);
            });
            if (suggestionsForNode.length === 0 && !hasUnresolvedRole) return null;
            return (
              <div className="mb-4 p-3 rounded-lg border border-amber-500/50 bg-amber-500/10 space-y-2">
                {hasUnresolvedRole && (
                  <p className="text-amber-600 text-sm">Role not set – please select Father or Mother.</p>
                )}
                {suggestionsForNode.length > 0 && (
                  <div>
                    <p className="text-amber-600 text-sm mb-1">
                      Suggested: {suggestionsForNode.length} change{suggestionsForNode.length === 1 ? "" : "s"} available
                    </p>
                    <button
                      type="button"
                      onClick={() => setReviewNodesModalOpen(true)}
                      className="text-xs px-2 py-1 rounded border border-amber-500/50 hover:bg-amber-500/20 text-amber-600"
                    >
                      Review suggestions
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
          <div className="mb-4 flex flex-col gap-2">
            {(nodeData as PersonNodeData).anchored ? (
              <button
                type="button"
                onClick={() => setPersonAnchored(selectedNode.id, false)}
                className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent"
              >
                Clear Anchor
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPersonAnchored(selectedNode.id, true)}
                className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent"
              >
                Set as Anchor
              </button>
            )}
          </div>
          <div className="mb-4">
            <label className="block text-dark-muted text-sm mb-2">Generation anchor</label>
            <select
              value={(nodeData as PersonNodeData).genAnchorId ?? ""}
              onChange={(e) => updateNodeGenAnchor(selectedNode.id, e.target.value || null)}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">None</option>
              {generationAnchors.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatGenerationAnchorLabel(a, genLabelMode)}
                  {a.customLabel ? ` — ${a.customLabel}` : ""}
                </option>
              ))}
            </select>
          </div>
          <ParentsSection
            personId={selectedNode.id}
            nodes={nodes}
            edges={edges}
            onSelectParent={(id) => setSelectedNodeIds([id])}
          />
          <SiblingsSection
            personId={selectedNode.id}
            nodes={nodes}
            edges={edges}
            onSelectSibling={(id) => setSelectedNodeIds([id])}
          />
          <PersonUnionsSection
            personId={selectedNode.id}
            nodes={nodes}
            edges={edges}
            onSelectNode={(id) => setSelectedNodeIds([id])}
            updateUnionPartnerRole={updateUnionPartnerRole}
            swapPersonUnionSides={swapPersonUnionSides}
            moveChildToUnion={moveChildToUnion}
            requestRemoveConnection={requestRemoveConnection}
          />
          <div className="mb-4">
            <div className="space-y-2">
              <Input
                ref={firstRef}
                label="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onBlur={saveNameParts}
                onKeyDown={(e) => {
                  if (e.key === "Tab") makeTabHandler(0, e.shiftKey)(e);
                }}
              />
              <Input
                ref={middleRef}
                label="Middle name"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                onBlur={saveNameParts}
                onKeyDown={(e) => {
                  if (e.key === "Tab") makeTabHandler(1, e.shiftKey)(e);
                }}
              />
              <Input
                ref={lastRef}
                label="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onBlur={saveNameParts}
                onKeyDown={(e) => {
                  if (e.key === "Tab") makeTabHandler(2, e.shiftKey)(e);
                }}
              />
              <Input
                ref={nicknamesRef}
                label="Nicknames"
                value={nicknamesInput}
                onChange={(e) => setNicknamesInput(e.target.value)}
                onBlur={saveNicknames}
                onKeyDown={(e) => {
                  if (e.key === "Tab") makeTabHandler(3, e.shiftKey)(e);
                }}
                placeholder="Bob, Bobby, Robert"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-dark-muted text-sm mb-2">Notes</label>
            <textarea
              value={nodeData.notes}
              onChange={(e) => updateNodeNotes(selectedNode.id, e.target.value)}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm resize-y min-h-[80px] focus:outline-none focus:border-blue-500"
              placeholder="Notes..."
            />
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2">
            {(nodeData as UnionNodeData).isMainGraph ? (
              <button
                type="button"
                onClick={() => setUnionMainGraph(selectedNode.id, false)}
                className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent"
              >
                Clear Main Graph
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSetMainGraphClick(selectedNode.id)}
                className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent"
              >
                Set as Main Graph
              </button>
            )}
          </div>
          <div className="mb-4">
            <label className="block text-dark-muted text-sm mb-2">Name</label>
            <input
              ref={unionNameRef}
              type="text"
              value={unionNameDraft}
              onChange={(e) => setUnionNameDraft(e.target.value)}
              onBlur={() => setUnionName(selectedNode.id, unionNameDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setUnionName(selectedNode.id, unionNameDraft);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="mb-4">
            <label className="block text-dark-muted text-sm mb-2">Partners</label>
            <PartnersDisplay nodes={nodes} unionData={nodeData as UnionNodeData} />
          </div>
          <UnionRoleControls
            unionId={selectedNode.id}
            unionData={nodeData as UnionNodeData}
            nodes={nodes}
            updateUnionPartnerRole={updateUnionPartnerRole}
          />
          <div className="mb-4 flex flex-wrap gap-2">
            <SwapPartnersButton
              unionData={nodeData as UnionNodeData}
              unionId={selectedNode.id}
              swapUnionPartners={swapUnionPartners}
              nodes={nodes}
            />
            <SwapUnionSidesButton
              unionData={nodeData as UnionNodeData}
              unionId={selectedNode.id}
              swapUnionHandleSides={swapUnionHandleSides}
            />
          </div>
          {(() => {
            const unionData = nodeData as UnionNodeData;
            const effectiveStyle = resolveUnionConnectionStyle(unionData, connectionStyles);
            const styleName = getConnectionStyleName(unionData, connectionStyles);
            if (!effectiveStyle.description && styleName === "Default") return null;
            return (
              <div className="mb-4">
                <label className="block text-dark-muted text-sm mb-2">Connection Style</label>
                <div className="text-dark-text text-sm">{styleName}</div>
                {effectiveStyle.description && (
                  <div className="text-dark-muted text-xs mt-1">{effectiveStyle.description}</div>
                )}
              </div>
            );
          })()}
          <div className="mb-4">
            <label className="block text-dark-muted text-sm mb-2">Notes</label>
            <textarea
              value={nodeData.notes}
              onChange={(e) => updateNodeNotes(selectedNode.id, e.target.value)}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm resize-y min-h-[80px] focus:outline-none focus:border-blue-500"
              placeholder="Notes..."
            />
          </div>
        </>
      )}
      {crownReassignTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" role="dialog" aria-modal>
          <div className="mx-4 max-w-sm rounded-lg border border-dark-accent bg-dark-surface p-4 shadow-xl">
            <h3 className="text-sm font-medium text-dark-text mb-2">Reassign main graph?</h3>
            <p className="text-dark-muted text-sm mb-4">
              Assigning the crown to this union will remove it from the current main graph union in
              this family. Continue?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setCrownReassignTarget(null)}
                className="px-3 py-1.5 text-sm rounded border border-dark-accent/50 hover:border-dark-accent text-dark-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setUnionMainGraph(crownReassignTarget, true);
                  setCrownReassignTarget(null);
                }}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
