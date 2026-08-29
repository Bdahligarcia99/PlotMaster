import { useState, useEffect, useLayoutEffect, useRef } from "react";
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
  BUILT_IN_PARENT_ROLES,
  BUILT_IN_GENDERS,
  BUILT_IN_CHILD_ROLES,
  hasUnknownParentRole,
  getAnchorAtY,
  DEFAULT_PERSON_H,
} from "../../store/familyTreeStore";
import type { PersonNodeData, UnionNodeData, ParentRole } from "../../store/familyTreeStore";
import Input from "../ui/Input";

const CUSTOM_SENTINEL = "__custom__";

const PARENT_ROLE_LABELS: Record<string, string> = {
  father: "Father",
  mother: "Mother",
  unknown: "Unknown",
  guardian: "Guardian",
  stepmother: "Stepmother",
  stepfather: "Stepfather",
};

const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

const CHILD_ROLE_LABELS: Record<string, string> = {
  son: "Son",
  daughter: "Daughter",
  child: "Child",
  adoptive_son: "Adoptive Son",
  adoptive_daughter: "Adoptive Daughter",
  adoptive_child: "Adoptive Child",
};

const selectClassName =
  "w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500";

function ChildRoleSelect({
  value,
  onChange,
  customChildRoles,
  addCustomChildRole,
}: {
  value: string;
  onChange: (v: string | null) => void;
  customChildRoles: string[];
  addCustomChildRole: (label: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === CUSTOM_SENTINEL) {
      setShowCustom(true);
      return;
    }
    onChange(v || null);
  };

  const handleAddCustom = () => {
    const label = customLabel.trim();
    if (!label) return;
    addCustomChildRole(label);
    onChange(label);
    setCustomLabel("");
    setShowCustom(false);
  };

  return (
    <div>
      <select value={value} onChange={handleSelect} className={selectClassName}>
        <option value="">Unassigned</option>
        {BUILT_IN_CHILD_ROLES.map((r) => (
          <option key={r} value={r}>
            {CHILD_ROLE_LABELS[r] ?? r}
          </option>
        ))}
        {customChildRoles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>Custom...</option>
      </select>
      {showCustom && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Custom role label"
            className="flex-1 px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded-lg text-dark-text"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            className="px-2 py-1 text-sm rounded border border-dark-accent/50 hover:bg-dark-accent/30 text-dark-text"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function ParentRoleSelect({
  value,
  onChange,
  customParentRoles,
  addCustomParentRole,
}: {
  value: string;
  onChange: (v: string | null) => void;
  customParentRoles: string[];
  addCustomParentRole: (label: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === CUSTOM_SENTINEL) {
      setShowCustom(true);
      return;
    }
    onChange(v || null);
  };

  const handleAddCustom = () => {
    const label = customLabel.trim();
    if (!label) return;
    addCustomParentRole(label);
    onChange(label);
    setCustomLabel("");
    setShowCustom(false);
  };

  return (
    <div>
      <select value={value} onChange={handleSelect} className={selectClassName}>
        <option value="">Unassigned</option>
        {BUILT_IN_PARENT_ROLES.map((r) => (
          <option key={r} value={r}>
            {PARENT_ROLE_LABELS[r] ?? r}
          </option>
        ))}
        {customParentRoles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>Custom...</option>
      </select>
      {showCustom && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Custom role label"
            className="flex-1 px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded-lg text-dark-text"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            className="px-2 py-1 text-sm rounded border border-dark-accent/50 hover:bg-dark-accent/30 text-dark-text"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function GenderSelect({
  value,
  onChange,
  customGenders,
  addCustomGender,
}: {
  value: string;
  onChange: (v: string | null) => void;
  customGenders: string[];
  addCustomGender: (label: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === CUSTOM_SENTINEL) {
      setShowCustom(true);
      return;
    }
    onChange(v || null);
  };

  const handleAddCustom = () => {
    const label = customLabel.trim();
    if (!label) return;
    addCustomGender(label);
    onChange(label);
    setCustomLabel("");
    setShowCustom(false);
  };

  return (
    <div>
      <select value={value} onChange={handleSelect} className={selectClassName}>
        <option value="">Unassigned</option>
        {BUILT_IN_GENDERS.map((g) => (
          <option key={g} value={g}>
            {GENDER_LABELS[g] ?? g}
          </option>
        ))}
        {customGenders.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>Custom...</option>
      </select>
      {showCustom && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Custom gender label"
            className="flex-1 px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded-lg text-dark-text"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            className="px-2 py-1 text-sm rounded border border-dark-accent/50 hover:bg-dark-accent/30 text-dark-text"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

type ChildUnionInfo = {
  unionId: string;
  unionNode: { id: string; data: unknown };
  parents: { id: string; displayName: string }[];
  siblings: { id: string; displayName: string }[];
};

function getChildUnionsForPerson(
  personId: string,
  nodes: { id: string; type?: string; data: unknown }[],
  edges: Edge[]
): ChildUnionInfo[] {
  const parentUnionIds = edges
    .filter((e) => isChildEdge(e) && e.target === personId)
    .map((e) => e.source);

  const result: ChildUnionInfo[] = [];
  for (const unionId of parentUnionIds) {
    const unionNode = nodes.find((n) => n.id === unionId && n.type === "union");
    if (!unionNode) continue;
    const data = unionNode.data as UnionNodeData;
    const leftId = data.leftPartnerId ?? data.partnerIds?.[0];
    const rightId = data.rightPartnerId ?? data.partnerIds?.[1];
    const parents = [leftId, rightId]
      .filter((id): id is string => !!id)
      .map((id) => {
        const node = nodes.find((n) => n.id === id && n.type === "person");
        const displayName = node?.data
          ? getPersonDisplayName(node.data as PersonNodeData, id, nodes)
          : id;
        return { id, displayName };
      });
    const siblingIds = edges
      .filter((e) => isChildEdge(e) && e.source === unionId)
      .map((e) => e.target)
      .filter((id) => id !== personId);
    const siblings = siblingIds.map((id) => {
      const node = nodes.find((n) => n.id === id && n.type === "person");
      const displayName = node?.data
        ? getPersonDisplayName(node.data as PersonNodeData, id, nodes)
        : id;
      return { id, displayName };
    });
    result.push({ unionId, unionNode, parents, siblings });
  }
  return result;
}

function getChildRoleForPerson(unionId: string, personId: string, edges: Edge[]): string {
  const edge = edges.find(
    (e) => isChildEdge(e) && e.source === unionId && e.target === personId
  );
  return (edge?.data as { childRole?: string } | undefined)?.childRole ?? "";
}

function PersonParentUnionsSection({
  personId,
  nodes,
  edges,
  onSelectNode,
}: {
  personId: string;
  nodes: { id: string; type?: string; data: unknown }[];
  edges: Edge[];
  onSelectNode: (id: string) => void;
}) {
  const childUnions = getChildUnionsForPerson(personId, nodes, edges);
  if (childUnions.length === 0) return null;

  return (
    <div className="space-y-4 mb-4">
      {childUnions.map((cu) => (
        <div
          key={cu.unionId}
          className="rounded-lg border border-dark-accent/40 bg-dark-bg/30 px-3 py-3"
        >
          <div className="space-y-2">
            {cu.parents.length > 0 && (
              <div>
                <label className="block text-dark-muted text-sm mb-1">Parents</label>
                <div className="space-y-1">
                  {cu.parents.map(({ id, displayName }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectNode(id)}
                      className="block w-full text-left text-dark-text text-sm hover:text-blue-400 hover:underline"
                    >
                      {displayName}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {cu.siblings.length > 0 && (
              <div>
                <label className="block text-dark-muted text-sm mb-1">Siblings</label>
                <div className="space-y-1">
                  {cu.siblings.map(({ id, displayName }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectNode(id)}
                      className="block w-full text-left text-dark-text text-sm hover:text-blue-400 hover:underline"
                    >
                      {displayName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
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
  customParentRoles,
  addCustomParentRole,
}: {
  unionId: string;
  unionData: UnionNodeData;
  nodes: { id: string; type?: string; data: unknown }[];
  updateUnionPartnerRole: (unionId: string, slot: "left" | "right", role: ParentRole | null) => void;
  customParentRoles: string[];
  addCustomParentRole: (label: string) => void;
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
  return (
    <div className="mb-4 space-y-2">
      <label className="block text-dark-muted text-sm mb-2">Parent roles</label>
      <div className="space-y-2">
        <div>
          <span className="block text-dark-muted text-xs mb-1">{leftName}</span>
          <ParentRoleSelect
            value={unionData.leftPartnerRole ?? ""}
            onChange={(v) => updateUnionPartnerRole(unionId, "left", v)}
            customParentRoles={customParentRoles}
            addCustomParentRole={addCustomParentRole}
          />
        </div>
        <div>
          <span className="block text-dark-muted text-xs mb-1">{rightName}</span>
          <ParentRoleSelect
            value={unionData.rightPartnerRole ?? ""}
            onChange={(v) => updateUnionPartnerRole(unionId, "right", v)}
            customParentRoles={customParentRoles}
            addCustomParentRole={addCustomParentRole}
          />
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
  customParentRoles,
  addCustomParentRole,
}: {
  personId: string;
  nodes: { id: string; type?: string; data: unknown }[];
  edges: Edge[];
  onSelectNode: (id: string) => void;
  updateUnionPartnerRole: (unionId: string, slot: "left" | "right", role: ParentRole | null) => void;
  swapPersonUnionSides: (personId: string) => boolean;
  moveChildToUnion: (childId: string, fromUnionId: string, toUnionId: string) => boolean;
  requestRemoveConnection: (target: import("../../store/familyTreeStore").RemoveConnectionTarget) => string | null;
  customParentRoles: string[];
  addCustomParentRole: (label: string) => void;
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
          <div key={union.unionId}>
            <div className="mb-2">
              <label className="block text-dark-muted text-sm mb-2">
                Role with {union.otherPartnerName}
              </label>
              <ParentRoleSelect
                value={
                  ((union.unionNode.data as UnionNodeData)[
                    union.slot === "left" ? "leftPartnerRole" : "rightPartnerRole"
                  ] ?? "") as string
                }
                onChange={(v) => updateUnionPartnerRole(union.unionId, union.slot, v)}
                customParentRoles={customParentRoles}
                addCustomParentRole={addCustomParentRole}
              />
            </div>
            <div className="rounded-lg border border-dark-accent/40 bg-dark-bg/30 px-3 py-3">
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
    setPersonGender,
    setPersonGenAnchorLocked,
    setSelectedNodeIds,
    updatePersonNameParts,
    updatePersonNicknames,
    updateNodeNotes,
    swapUnionPartners,
    swapUnionHandleSides,
    swapPersonUnionSides,
    updateUnionPartnerRole,
    updateChildRole,
    moveChildToUnion,
    requestRemoveConnection,
    generationAnchors,
    genLabelMode,
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
  const customParentRoles = useFamilyTreeStore((s) => s.customParentRoles);
  const customGenders = useFamilyTreeStore((s) => s.customGenders);
  const customChildRoles = useFamilyTreeStore((s) => s.customChildRoles);
  const addCustomParentRole = useFamilyTreeStore((s) => s.addCustomParentRole);
  const addCustomGender = useFamilyTreeStore((s) => s.addCustomGender);
  const addCustomChildRole = useFamilyTreeStore((s) => s.addCustomChildRole);
  const nodeSizesById = useFamilyTreeStore((s) => s.nodeSizesById);

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
  const draftPersonIdRef = useRef<string | null>(null);
  const autoSelectArmedRef = useRef(false);
  const autoSelectElRef = useRef<HTMLInputElement | null>(null);
  const autoSelectMouseUpCountRef = useRef(0);

  const refs = [firstRef, middleRef, lastRef, nicknamesRef];

  const disarmAutoSelect = () => {
    autoSelectArmedRef.current = false;
    autoSelectElRef.current = null;
    autoSelectMouseUpCountRef.current = 0;
  };

  useEffect(() => {
    if (selectedNode && (selectedNode.data as { kind?: string }).kind === "person") {
      const d = selectedNode.data as PersonNodeData;
      const parts = getPersonNameParts(d);
      draftPersonIdRef.current = selectedNode.id;
      setFirstName(parts.first);
      setMiddleName(parts.middle);
      setLastName(parts.last);
      const nicks = d.nicknames ?? [];
      setNicknamesInput(nicks.join(", "));
      disarmAutoSelect();
    }
  }, [selectedNode?.id, (selectedNode?.data as PersonNodeData)?.firstName, (selectedNode?.data as PersonNodeData)?.middleName, (selectedNode?.data as PersonNodeData)?.lastName, (selectedNode?.data as PersonNodeData)?.name, (selectedNode?.data as PersonNodeData)?.nicknames]);

  useLayoutEffect(() => {
    if (!autoSelectArmedRef.current || !autoSelectElRef.current) return;
    const el = autoSelectElRef.current;
    if (document.activeElement === el) {
      el.select();
    }
  });

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
    if (!selectedNode || (selectedNode.data as { kind?: string }).kind !== "person") return;
    if (draftPersonIdRef.current !== selectedNode.id) return;
    const stored = getPersonNameParts(selectedNode.data as PersonNodeData);
    const norm = (s: string) => (s.trim() === "?" ? "" : s.trim());
    if (
      norm(stored.first) === norm(firstName) &&
      norm(stored.middle) === norm(middleName) &&
      norm(stored.last) === norm(lastName)
    ) {
      return;
    }
    updatePersonNameParts(selectedNode.id, { firstName, middleName, lastName });
  };

  const saveNicknames = () => {
    if (!selectedNode || (selectedNode.data as { kind?: string }).kind !== "person") return;
    if (draftPersonIdRef.current !== selectedNode.id) return;
    const parsed = nicknamesInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const stored = (selectedNode.data as PersonNodeData).nicknames ?? [];
    if (parsed.join(",") === stored.join(",")) return;
    updatePersonNicknames(selectedNode.id, parsed);
  };

  const autoSelectNames =
    /^Person \d+$/.test(firstName.trim()) ||
    [firstName, middleName, lastName].some((v) => v.includes("?"));

  const handleNameFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!autoSelectNames) return;
    autoSelectElRef.current = e.currentTarget;
    autoSelectArmedRef.current = true;
    autoSelectMouseUpCountRef.current = 0;
    e.currentTarget.select();
    requestAnimationFrame(() => {
      if (autoSelectArmedRef.current && autoSelectElRef.current === e.currentTarget) {
        e.currentTarget.select();
      }
    });
  };

  const handleNameMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    if (!autoSelectArmedRef.current) return;
    if (autoSelectMouseUpCountRef.current === 0) {
      autoSelectMouseUpCountRef.current += 1;
      e.preventDefault();
      return;
    }
    disarmAutoSelect();
  };

  const nameFocusProps = autoSelectNames
    ? { onFocus: handleNameFocus, onMouseUp: handleNameMouseUp }
    : {};

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
  const headerName =
    nodeData.kind === "person"
      ? getPersonNameParts(nodeData as PersonNodeData).first || "?"
      : (nodeData as UnionNodeData).name || "?";
  const headerType = nodeData.kind === "person" ? "Person" : "Union";

  return (
    <div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide flex-1">
          Inspector — {headerName} ({headerType})
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
                  <p className="text-amber-600 text-sm">Parent role unassigned in one or more unions.</p>
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
            {(() => {
              const pd = nodeData as PersonNodeData;
              const h = nodeSizesById[selectedNode.id]?.height ?? DEFAULT_PERSON_H;
              const centerY = selectedNode.position.y + h / 2;
              const inherited = getAnchorAtY(generationAnchors, centerY);
              const effectiveId = pd.genAnchorId ?? inherited?.id ?? null;
              const effectiveAnchor = effectiveId
                ? generationAnchors.find((a) => a.id === effectiveId)
                : null;
              const label = effectiveAnchor
                ? formatGenerationAnchorLabel(effectiveAnchor, genLabelMode)
                : "None";
              return (
                <>
                  <label className="block text-dark-muted text-sm mb-2">Generation anchor</label>
                  <div className="text-dark-text text-sm">
                    {label}
                    {pd.genAnchorLocked && effectiveAnchor ? " (locked)" : ""}
                  </div>
                  {!effectiveAnchor && (
                    <p className="text-dark-muted text-xs mt-1">
                      Move the node to inherit a generation anchor.
                    </p>
                  )}
                </>
              );
            })()}
            <label className="flex items-center gap-2 text-dark-muted text-sm cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={!!(nodeData as PersonNodeData).genAnchorLocked}
                disabled={(() => {
                  const pd = nodeData as PersonNodeData;
                  const h = nodeSizesById[selectedNode.id]?.height ?? DEFAULT_PERSON_H;
                  const centerY = selectedNode.position.y + h / 2;
                  const inherited = getAnchorAtY(generationAnchors, centerY);
                  return !(pd.genAnchorId ?? inherited?.id);
                })()}
                onChange={(e) => setPersonGenAnchorLocked(selectedNode.id, e.target.checked)}
                className="themed-checkbox"
              />
              Lock Gen Anchor
            </label>
          </div>
          <div className="mb-4">
            <label className="block text-dark-muted text-sm mb-2">Gender</label>
            <GenderSelect
              value={(nodeData as PersonNodeData).gender ?? ""}
              onChange={(v) => setPersonGender(selectedNode.id, v)}
              customGenders={customGenders}
              addCustomGender={addCustomGender}
            />
          </div>
          {(() => {
            const childUnions = getChildUnionsForPerson(selectedNode.id, nodes, edges);
            if (childUnions.length === 0) return null;
            return (
              <div className="mb-4 space-y-4">
                {childUnions.map((cu) => {
                  const childRoleLabel =
                    childUnions.length > 1
                      ? `Child Role (${cu.parents.map((p) => p.displayName).join(" & ")})`
                      : "Child Role";
                  return (
                    <div key={`child-role-${cu.unionId}`}>
                      <label className="block text-dark-muted text-sm mb-2">{childRoleLabel}</label>
                      <ChildRoleSelect
                        value={getChildRoleForPerson(cu.unionId, selectedNode.id, edges)}
                        onChange={(v) => updateChildRole(cu.unionId, selectedNode.id, v)}
                        customChildRoles={customChildRoles}
                        addCustomChildRole={addCustomChildRole}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <PersonParentUnionsSection
            personId={selectedNode.id}
            nodes={nodes}
            edges={edges}
            onSelectNode={(id) => setSelectedNodeIds([id])}
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
            customParentRoles={customParentRoles}
            addCustomParentRole={addCustomParentRole}
          />
          {(() => {
            const unknownLocked = hasUnknownParentRole(selectedNode.id, nodes);
            return (
          <div className="mb-4">
            {unknownLocked && (
              <p className="text-dark-muted text-xs mb-2">
                Name and nickname fields are locked because this person has the Unknown parent role.
              </p>
            )}
            <div className="space-y-2">
              <Input
                ref={firstRef}
                label="First name"
                value={firstName}
                onChange={(e) => {
                  disarmAutoSelect();
                  setFirstName(e.target.value);
                }}
                onBlur={() => {
                  disarmAutoSelect();
                  saveNameParts();
                }}
                disabled={unknownLocked}
                onKeyDown={(e) => {
                  disarmAutoSelect();
                  if (e.key === "Tab") makeTabHandler(0, e.shiftKey)(e);
                }}
                {...nameFocusProps}
              />
              <Input
                ref={middleRef}
                label="Middle name"
                value={middleName}
                onChange={(e) => {
                  disarmAutoSelect();
                  setMiddleName(e.target.value);
                }}
                onBlur={() => {
                  disarmAutoSelect();
                  saveNameParts();
                }}
                disabled={unknownLocked}
                onKeyDown={(e) => {
                  disarmAutoSelect();
                  if (e.key === "Tab") makeTabHandler(1, e.shiftKey)(e);
                }}
                {...nameFocusProps}
              />
              <Input
                ref={lastRef}
                label="Last name"
                value={lastName}
                onChange={(e) => {
                  disarmAutoSelect();
                  setLastName(e.target.value);
                }}
                onBlur={() => {
                  disarmAutoSelect();
                  saveNameParts();
                }}
                disabled={unknownLocked}
                onKeyDown={(e) => {
                  disarmAutoSelect();
                  if (e.key === "Tab") makeTabHandler(2, e.shiftKey)(e);
                }}
                {...nameFocusProps}
              />
              <Input
                ref={nicknamesRef}
                label="Nicknames"
                value={nicknamesInput}
                onChange={(e) => {
                  disarmAutoSelect();
                  setNicknamesInput(e.target.value);
                }}
                onBlur={() => {
                  disarmAutoSelect();
                  saveNicknames();
                }}
                disabled={unknownLocked}
                onKeyDown={(e) => {
                  disarmAutoSelect();
                  if (e.key === "Tab") makeTabHandler(3, e.shiftKey)(e);
                }}
                placeholder="Bob, Bobby, Robert"
              />
            </div>
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
            customParentRoles={customParentRoles}
            addCustomParentRole={addCustomParentRole}
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
