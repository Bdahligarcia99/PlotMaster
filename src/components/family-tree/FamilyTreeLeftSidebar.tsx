import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Node, Edge } from "reactflow";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import type { PersonNodeData, UnionNodeData, FamilyGroup } from "../../store/familyTreeStore";
import { formatGenerationAnchorLabel, getPersonDisplayName, isChildEdge, computeBranchMemberIds, getUnassignedReasons, isNodeUnassigned, computeFamilyClusterAnalysis, isUnionClusterUnassigned, getFamilyNodeWarnings, findFamilyForNode, getUnionFamilyMemberIds, getFamilyVisibleNodeIds, computeAnchorBlockedUnionIds } from "../../store/familyTreeStore";
import {
  getDocumentsForFamily,
  getDocumentRefsForNode,
} from "../../store/familyTreeDocumentHelpers";
import Button from "../ui/Button";

function HazardTriangleIcon({ title, className = "" }: { title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={`flex-shrink-0 flex items-center justify-center text-amber-400 ${className}`}
    >
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
      </svg>
    </span>
  );
}

function PersonGenBadge({
  personId,
  nodes,
  getPersonGenLabel,
  pill = false,
  showWarnings = true,
}: {
  personId: string;
  nodes: Node<PersonNodeData | UnionNodeData>[];
  getPersonGenLabel: (id: string) => string | null;
  pill?: boolean;
  showWarnings?: boolean;
}) {
  const label = getPersonGenLabel(personId);
  if (label) {
    return pill ? (
      <span className="text-dark-muted text-[10px] px-2 py-0.5 rounded-full bg-dark-accent/50 border border-dark-accent/50 flex-shrink-0">
        {label}
      </span>
    ) : (
      <span className="text-dark-muted text-[10px] flex-shrink-0">{label}</span>
    );
  }
  if (!showWarnings) return null;
  const node = nodes.find((n) => n.id === personId && (n.data as { kind?: string }).kind === "person");
  const genAnchorId = (node?.data as PersonNodeData)?.genAnchorId;
  if (!genAnchorId) {
    return <HazardTriangleIcon title="No generation assigned" />;
  }
  return null;
}

function AnchorDot({ personId, nodes }: { personId: string; nodes: Node<PersonNodeData | UnionNodeData>[] }) {
  const node = nodes.find((n) => n.id === personId);
  if (!(node?.data as PersonNodeData)?.anchored) return null;
  return (
    <span
      title="Anchored — stays fixed when union moves"
      className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-amber-500/80 border border-amber-400"
    />
  );
}

function EntityFamilyWarnings({
  nodeId,
  family,
  nodes,
  edges,
}: {
  nodeId: string;
  family: FamilyGroup | null | undefined;
  nodes: Node<PersonNodeData | UnionNodeData>[];
  edges: Edge[];
}) {
  if (!family) return null;
  return (
    <>
      {getFamilyNodeWarnings(nodeId, family, nodes, edges).map((w) => (
        <HazardTriangleIcon key={w} title={w} />
      ))}
    </>
  );
}

export interface FamilyUnit {
  unionId: string;
  parents: [string, string];
  children: string[];
}

function buildFamilyUnits(
  nodes: Node<PersonNodeData | UnionNodeData>[],
  edges: Edge[]
): { units: FamilyUnit[]; linkedPersonIds: Set<string> } {
  const personById = new Map(
    nodes
      .filter((n): n is Node<PersonNodeData> => n.data.kind === "person")
      .map((n) => [n.id, n])
  );
  const unionNodes = nodes.filter(
    (n): n is Node<UnionNodeData> => n.type === "union" && (n.data as UnionNodeData).kind === "union"
  );

  const linkedPersonIds = new Set<string>();
  const units: FamilyUnit[] = [];

  for (const union of unionNodes) {
    const data = union.data as UnionNodeData;
    const partnerIds = data.partnerIds;
    if (!partnerIds || partnerIds.length !== 2) continue;

    const leftId = data.leftPartnerId ?? partnerIds[0];
    const rightId = data.rightPartnerId ?? partnerIds[1];
    if (leftId == null || rightId == null) continue;
    const leftPerson = personById.get(leftId);
    const rightPerson = personById.get(rightId);
    if (!leftPerson || !rightPerson) continue;

    const childIds = edges
      .filter((e) => e.source === union.id && isChildEdge(e))
      .map((e) => e.target)
      .filter((id) => personById.has(id));

    linkedPersonIds.add(leftId);
    linkedPersonIds.add(rightId);
    childIds.forEach((id) => linkedPersonIds.add(id));

    units.push({
      unionId: union.id,
      parents: [leftId, rightId],
      children: childIds,
    });
  }

  return { units, linkedPersonIds };
}

function getPersonName(nodes: Node<PersonNodeData | UnionNodeData>[], id: string): string {
  const n = nodes.find((x) => x.id === id && (x.data as { kind?: string }).kind === "person");
  if (!n) return "New Person";
  return getPersonDisplayName(n.data as PersonNodeData, n.id, nodes);
}

interface FamilyTreeLeftSidebarProps {
  onSelectNode?: () => void;
  textEditorMode?: boolean;
  openFileIds?: string[];
  activeFileId?: string | null;
  dirtyDocIds?: Set<string>;
  onOpenFile?: (docId: string) => void;
  onNewUserFile?: (familyId: string | null) => void;
  onDeleteUserFile?: (docId: string) => void;
}

function getDisplayName(
  nodes: Node<PersonNodeData | UnionNodeData>[],
  id: string,
  kind: "person" | "union"
): string {
  const n = nodes.find((x) => x.id === id);
  if (!n) return "Entity";
  if (kind === "person") return getPersonDisplayName(n.data as PersonNodeData, n.id, nodes);
  const d = n.data as UnionNodeData;
  const leftId = d.leftPartnerId ?? d.partnerIds?.[0];
  const rightId = d.rightPartnerId ?? d.partnerIds?.[1];
  const leftName = leftId != null ? getPersonName(nodes, leftId) : "?";
  const rightName = rightId != null ? getPersonName(nodes, rightId) : "?";
  return `${leftName} ↔ ${rightName}`;
}

export default function FamilyTreeLeftSidebar({
  onSelectNode,
  textEditorMode = false,
  openFileIds = [],
  activeFileId = null,
  dirtyDocIds = new Set(),
  onOpenFile,
  onNewUserFile,
  onDeleteUserFile,
}: FamilyTreeLeftSidebarProps) {
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const edges = useFamilyTreeStore((s) => s.edges);
  const documents = useFamilyTreeStore((s) => s.documents);
  const selectedNodeIds = useFamilyTreeStore((s) => s.selectedNodeIds);
  const setSelectedNodeIds = useFamilyTreeStore((s) => s.setSelectedNodeIds);
  const setSelectionWithPrimary = useFamilyTreeStore((s) => s.setSelectionWithPrimary);
  const updateNodeName = useFamilyTreeStore((s) => s.updateNodeName);
  const families = useFamilyTreeStore((s) => s.families);
  const activeFamilyTabId = useFamilyTreeStore((s) => s.activeFamilyTabId);
  const setActiveFamilyTabId = useFamilyTreeStore((s) => s.setActiveFamilyTabId);
  const isolationModeActive = useFamilyTreeStore((s) => s.isolationModeActive);
  const setIsolationModeActive = useFamilyTreeStore((s) => s.setIsolationModeActive);
  const setPendingFocusFamilyId = useFamilyTreeStore((s) => s.setPendingFocusFamilyId);
  const setInspectorFamilyId = useFamilyTreeStore((s) => s.setInspectorFamilyId);
  const inspectorFamilyId = useFamilyTreeStore((s) => s.inspectorFamilyId);
  const branches = useFamilyTreeStore((s) => s.branches);
  const activeBranchTabId = useFamilyTreeStore((s) => s.activeBranchTabId);
  const setActiveBranchTabId = useFamilyTreeStore((s) => s.setActiveBranchTabId);
  const setPendingFocusBranchId = useFamilyTreeStore((s) => s.setPendingFocusBranchId);
  const setInspectorBranchId = useFamilyTreeStore((s) => s.setInspectorBranchId);
  const deleteBranch = useFamilyTreeStore((s) => s.deleteBranch);
  const setBranchCustomName = useFamilyTreeStore((s) => s.setBranchCustomName);
  const placementTargetId = useFamilyTreeStore((s) => s.placementTargetId);
  const setPlacementTargetId = useFamilyTreeStore((s) => s.setPlacementTargetId);
  const createFamily = useFamilyTreeStore((s) => s.createFamily);
  const moveNodesToFamily = useFamilyTreeStore((s) => s.moveNodesToFamily);
  const deleteFocus = useFamilyTreeStore((s) => s.deleteFocus);
  const pendingDeleteConfirm = useFamilyTreeStore((s) => s.pendingDeleteConfirm);
  const requestDeleteSelection = useFamilyTreeStore((s) => s.requestDeleteSelection);
  const confirmPendingDelete = useFamilyTreeStore((s) => s.confirmPendingDelete);
  const cancelPendingDelete = useFamilyTreeStore((s) => s.cancelPendingDelete);
  const subEntitySelectionMode = useFamilyTreeStore((s) => s.subEntitySelectionMode);
  const setSubEntitySelectionMode = useFamilyTreeStore((s) => s.setSubEntitySelectionMode);
  const transferUnionsToNewFamily = useFamilyTreeStore((s) => s.transferUnionsToNewFamily);
  const [collapsedUnits, setCollapsedUnits] = useState<Set<string>>(new Set());
  const [transferConfirm, setTransferConfirm] = useState<{
    unionIds: string[];
    sourceFamilyId: string;
    restrictPersonIds: string[] | null;
    kind: "partial" | "lone";
  } | null>(null);
  const [createEmptyInstead, setCreateEmptyInstead] = useState(false);
  const [transferMemberError, setTransferMemberError] = useState(false);
  const [anchorBlockConfirm, setAnchorBlockConfirm] = useState<{
    reducedUnionIds: string[];
    sourceFamilyId: string;
    restrictPersonIds: string[] | null;
  } | null>(null);
  const pendingAnchorTransferWarning = useFamilyTreeStore((s) => s.pendingAnchorTransferWarning);
  const resolveAnchorTransferWarning = useFamilyTreeStore((s) => s.resolveAnchorTransferWarning);
  const [lastEntityClickedId, setLastEntityClickedId] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchDraftName, setBranchDraftName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [collapseAllActive, setCollapseAllActive] = useState(false);
  const [expandedFamilyGroups, setExpandedFamilyGroups] = useState<Set<string>>(
    () => new Set(["__all__"])
  );

  const isSelected = (id: string) => selectedNodeIds.includes(id);
  const focusIsFamily = deleteFocus === "family" || selectedNodeIds.length === 0;

  const unionRowSelectedClass = (id: string) =>
    isSelected(id)
      ? focusIsFamily
        ? "text-blue-400/60 bg-blue-500/5 ring-1 ring-blue-500/30 rounded px-1 -mx-1"
        : "text-blue-400 bg-blue-500/20 ring-1 ring-blue-500/50 rounded px-1 -mx-1"
      : "text-dark-text";

  const personRowSelectedClass = (id: string, base = "bg-dark-accent/30") =>
    isSelected(id)
      ? focusIsFamily
        ? "bg-blue-500/5 ring-1 ring-blue-500/30"
        : "bg-blue-500/20 ring-1 ring-blue-500/50"
      : base;

  const unassignedRowSelectedClass = (id: string) =>
    isSelected(id)
      ? focusIsFamily
        ? "border-blue-500/30 bg-blue-500/5 ring-1 ring-blue-500/30"
        : "border-blue-500 bg-blue-500/20 ring-1 ring-blue-500/50"
      : "border-dark-accent/30 bg-dark-accent/30";

  const { familyUnits, unassignedEntities } = useMemo(() => {
    const { units } = buildFamilyUnits(nodes, edges);

    const personNodes = nodes.filter(
      (n): n is Node<PersonNodeData> => n.data.kind === "person"
    );
    const unionById = new Map(
      nodes
        .filter((n) => n.type === "union")
        .map((n) => [n.id, n])
    );

    const sortedUnits = [...units].sort((a, b) => {
      const uA = unionById.get(a.unionId);
      const uB = unionById.get(b.unionId);
      if (!uA || !uB) return 0;
      const yA = uA.position.y;
      const yB = uB.position.y;
      if (yA !== yB) return yA - yB;
      return uA.position.x - uB.position.x;
    });

    const unitsWithSortedChildren = sortedUnits.map((u) => {
      const childNodes = u.children
        .map((id) => personNodes.find((n) => n.id === id))
        .filter((n): n is Node<PersonNodeData> => n != null);
      childNodes.sort((a, b) => {
        if (a.position.x !== b.position.x) return a.position.x - b.position.x;
        return a.id.localeCompare(b.id);
      });
      return { ...u, children: childNodes.map((n) => n.id) };
    });

    const unassigned = nodes
      .filter((n) => isNodeUnassigned(n.id, nodes, edges, families))
      .sort((a, b) => {
        const nameA = getDisplayName(nodes, a.id, a.type === "union" ? "union" : "person").toLowerCase();
        const nameB = getDisplayName(nodes, b.id, b.type === "union" ? "union" : "person").toLowerCase();
        const cmp = nameA.localeCompare(nameB);
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id);
      });

    return { familyUnits: unitsWithSortedChildren, unassignedEntities: unassigned };
  }, [nodes, edges, families]);

  const activeFamily = useMemo(
    () => (activeFamilyTabId != null ? families.find((f) => f.id === activeFamilyTabId) : null),
    [families, activeFamilyTabId]
  );

  const activeBranch = useMemo(
    () => (activeBranchTabId != null ? branches.find((b) => b.id === activeBranchTabId) : null),
    [branches, activeBranchTabId]
  );

  const branchMemberIds = useMemo(() => {
    if (!activeBranch) return null;
    return new Set(computeBranchMemberIds(activeBranch.rootPersonId, nodes, edges));
  }, [activeBranch, nodes, edges]);

  const visibleBranches = useMemo(() => {
    if (activeFamilyTabId == null) return branches;
    return branches.filter((b) => b.familyId === activeFamilyTabId);
  }, [branches, activeFamilyTabId]);

  const filteredFamilyUnits = useMemo(() => {
    if (branchMemberIds) {
      return familyUnits.filter((u) => branchMemberIds.has(u.unionId));
    }
    if (!activeFamily) return familyUnits;
    const unionSet = new Set(activeFamily.unionIds);
    return familyUnits.filter((u) => unionSet.has(u.unionId));
  }, [familyUnits, activeFamily, branchMemberIds]);

  const filteredUnassignedEntities = useMemo(() => {
    let pool = activeFamily
      ? (() => {
          const analysis = computeFamilyClusterAnalysis(activeFamily, nodes, edges);
          const clusterIds = new Set([
            ...analysis.unassignedUnionIds,
            ...analysis.unionlessPersonIds,
          ]);
          return nodes.filter((n) => clusterIds.has(n.id));
        })()
      : unassignedEntities;
    if (branchMemberIds) {
      pool = pool.filter((n) => branchMemberIds.has(n.id));
    }
    return pool.sort((a, b) => {
      const nameA = getDisplayName(nodes, a.id, a.type === "union" ? "union" : "person").toLowerCase();
      const nameB = getDisplayName(nodes, b.id, b.type === "union" ? "union" : "person").toLowerCase();
      const cmp = nameA.localeCompare(nameB);
      if (cmp !== 0) return cmp;
      return a.id.localeCompare(b.id);
    });
  }, [unassignedEntities, activeFamily, nodes, edges, branchMemberIds]);

  const visibleEntityOrder = useMemo(() => {
    const order: string[] = [];
    for (const unit of filteredFamilyUnits) {
      order.push(unit.unionId);
      if (!collapsedUnits.has(unit.unionId)) {
        order.push(unit.parents[0], unit.parents[1], ...unit.children);
      }
    }
    for (const n of filteredUnassignedEntities) {
      order.push(n.id);
    }
    return order;
  }, [filteredFamilyUnits, filteredUnassignedEntities, collapsedUnits]);

  const visibleUnionOrder = useMemo(
    () => filteredFamilyUnits.map((u) => u.unionId),
    [filteredFamilyUnits]
  );

  const unionIdForEntity = (id: string) =>
    filteredFamilyUnits.find(
      (u) => u.unionId === id || u.parents.includes(id) || u.children.includes(id)
    )?.unionId ?? null;

  const expandUnion = (uid: string) => [uid, ...getUnionFamilyMemberIds(uid, nodes, edges)];

  const resolveTransferPersonRestriction = (
    unionIds: string[]
  ): { restrictPersonIds: string[] | null; error: boolean } => {
    if (subEntitySelectionMode === "union") {
      return { restrictPersonIds: null, error: false };
    }
    const memberIds = new Set<string>();
    for (const uid of unionIds) {
      for (const pid of getUnionFamilyMemberIds(uid, nodes, edges)) {
        memberIds.add(pid);
      }
    }
    const selectedMembers = [...memberIds].filter((pid) => selectedNodeIds.includes(pid));
    if (selectedMembers.length === 0) {
      return { restrictPersonIds: null, error: true };
    }
    return { restrictPersonIds: selectedMembers, error: false };
  };

  const unassignedUnionSelectionIds = (unionId: string) => {
    const memberIds = getUnionFamilyMemberIds(unionId, nodes, edges).filter((pid) => {
      const p = nodes.find((n) => n.id === pid);
      return !(p?.data as PersonNodeData)?.anchored;
    });
    return [unionId, ...memberIds];
  };

  const isSameSelectionSet = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const setA = new Set(a);
    return b.every((id) => setA.has(id));
  };

  const generationAnchors = useFamilyTreeStore((s) => s.generationAnchors);
  const genLabelMode = useFamilyTreeStore((s) => s.genLabelMode);
  const connectionStyles = useFamilyTreeStore((s) => s.connectionStyles);
  const nameRoleSuggestions = useFamilyTreeStore((s) => s.nameRoleSuggestions);

  const getPersonGenLabel = (personId: string) => {
    const node = nodes.find((n) => n.id === personId && (n.data as { kind?: string }).kind === "person");
    const genAnchorId = (node?.data as PersonNodeData)?.genAnchorId;
    if (!genAnchorId) return null;
    const anchor = generationAnchors.find((a) => a.id === genAnchorId);
    if (!anchor) return null;
    const base = formatGenerationAnchorLabel(anchor, genLabelMode);
    return anchor.customLabel ? `${base} — ${anchor.customLabel}` : base;
  };

  const toggleUnit = (unionId: string) => {
    setCollapsedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unionId)) next.delete(unionId);
      else next.add(unionId);
      return next;
    });
  };

  const visibleUnitIds = useMemo(
    () => filteredFamilyUnits.map((u) => u.unionId),
    [filteredFamilyUnits]
  );

  const handleCollapseExpandAll = () => {
    if (collapseAllActive) {
      setCollapsedUnits((prev) => {
        const next = new Set(prev);
        for (const id of visibleUnitIds) next.delete(id);
        return next;
      });
      setCollapseAllActive(false);
    } else {
      setCollapsedUnits((prev) => {
        const next = new Set(prev);
        for (const id of visibleUnitIds) next.add(id);
        return next;
      });
      setCollapseAllActive(true);
    }
  };

  const handleFamilyTabClick = (familyId: string | null) => {
    setActiveFamilyTabId(familyId);
    setActiveBranchTabId(null);
    if (familyId == null) {
      setIsolationModeActive(false);
    } else {
      setPendingFocusFamilyId(familyId);
      if (inspectorFamilyId != null) {
        setInspectorFamilyId(familyId);
      }
    }
  };

  const handleFamilyTabDoubleClick = (e: React.MouseEvent, familyId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveFamilyTabId(familyId);
    setPendingFocusFamilyId(familyId);
    setInspectorFamilyId(familyId);
    onSelectNode?.();
  };

  const handleBranchTabClick = (branchId: string) => {
    setActiveBranchTabId(branchId);
    setPendingFocusBranchId(branchId);
    setInspectorBranchId(null);
    setInspectorFamilyId(null);
  };

  const handleBranchTabDoubleClick = (e: React.MouseEvent, branchId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveBranchTabId(branchId);
    setPendingFocusBranchId(branchId);
    setInspectorBranchId(branchId);
    setInspectorFamilyId(null);
    onSelectNode?.();
  };

  const startEditingBranch = (e: React.MouseEvent, branchId: string, currentName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingBranchId(branchId);
    setBranchDraftName(currentName);
  };

  const saveBranchName = (branchId: string) => {
    setBranchCustomName(branchId, branchDraftName);
    setEditingBranchId(null);
    setBranchDraftName("");
  };

  const cancelBranchEditing = () => {
    setEditingBranchId(null);
    setBranchDraftName("");
  };

  const getBranchRootName = (rootPersonId: string) => getPersonName(nodes, rootPersonId);

  const handleEntityClick = (e: React.MouseEvent, id: string) => {
    if (placementTargetId) setPlacementTargetId(null);
    if (e.shiftKey) {
      if (lastEntityClickedId != null) {
        const fromIdx = visibleEntityOrder.indexOf(lastEntityClickedId);
        const toIdx = visibleEntityOrder.indexOf(id);
        if (fromIdx >= 0 && toIdx >= 0) {
          const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
          const rangeIds = visibleEntityOrder.slice(lo, hi + 1);
          setSelectedNodeIds(rangeIds);
        } else {
          setSelectedNodeIds([id]);
        }
      } else {
        setSelectedNodeIds([id]);
      }
      setLastEntityClickedId(id);
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedNodeIds((prev) => {
        const next = prev.includes(id)
          ? prev.filter((x) => x !== id)
          : [...prev, id];
        return next;
      });
      setLastEntityClickedId(id);
    } else {
      setSelectedNodeIds([id]);
      setLastEntityClickedId(id);
    }
  };

  const handleUnionModeClick = (e: React.MouseEvent, id: string) => {
    if (placementTargetId) setPlacementTargetId(null);
    const uid = unionIdForEntity(id);
    const targetIds = uid ? expandUnion(uid) : [id];
    const anchorUid = lastEntityClickedId != null ? unionIdForEntity(lastEntityClickedId) : null;

    if (e.shiftKey) {
      if (anchorUid && uid) {
        const fromIdx = visibleUnionOrder.indexOf(anchorUid);
        const toIdx = visibleUnionOrder.indexOf(uid);
        if (fromIdx >= 0 && toIdx >= 0) {
          const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
          const rangeUnionIds = visibleUnionOrder.slice(lo, hi + 1);
          setSelectedNodeIds(rangeUnionIds.flatMap((u) => expandUnion(u)));
        } else {
          setSelectedNodeIds(targetIds);
        }
      } else {
        setSelectedNodeIds(targetIds);
      }
      setLastEntityClickedId(id);
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedNodeIds((prev) => {
        const allSelected = targetIds.every((x) => prev.includes(x));
        if (allSelected) return prev.filter((x) => !targetIds.includes(x));
        const next = new Set(prev);
        for (const x of targetIds) next.add(x);
        return [...next];
      });
      setLastEntityClickedId(id);
    } else {
      setSelectedNodeIds(targetIds);
      setLastEntityClickedId(id);
    }
  };

  const handleSidebarEntityClick = (e: React.MouseEvent, id: string) => {
    if (subEntitySelectionMode === "union") handleUnionModeClick(e, id);
    else handleEntityClick(e, id);
  };

  const handleUnionDoubleClick = (e: React.MouseEvent, unionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const memberIds = getUnionFamilyMemberIds(unionId, nodes, edges).filter((pid) => {
      const p = nodes.find((n) => n.id === pid);
      return !(p?.data as PersonNodeData)?.anchored;
    });
    setSelectionWithPrimary([unionId, ...memberIds], unionId);
    setLastEntityClickedId(unionId);
    onSelectNode?.();
  };

  const handlePersonRowDoubleClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedNodeIds([id]);
    setLastEntityClickedId(id);
    onSelectNode?.();
  };

  const proceedWithUnionTransfer = (
    unionIds: string[],
    sourceFamilyId: string,
    restrictPersonIds: string[] | null = null
  ) => {
    const contextFamily = families.find((f) => f.id === sourceFamilyId);
    if (!contextFamily || unionIds.length === 0) {
      createFamily();
      return;
    }
    const analysis = computeFamilyClusterAnalysis(contextFamily, nodes, edges);
    const allUnassigned = analysis.unassignedUnionIds;
    const isPartial =
      unionIds.length < allUnassigned.length &&
      unionIds.every((id) => allUnassigned.includes(id));
    setTransferConfirm({
      unionIds,
      sourceFamilyId,
      restrictPersonIds,
      kind: isPartial ? "partial" : "lone",
    });
  };

  useEffect(() => {
    if (transferConfirm) setCreateEmptyInstead(false);
  }, [transferConfirm]);

  const handleAddFamily = () => {
    const contextFamily =
      activeFamily ??
      (activeFamilyTabId != null ? families.find((f) => f.id === activeFamilyTabId) : null) ??
      families[0] ??
      null;
    const selectedUnions = selectedNodeIds.filter((id) => {
      const n = nodes.find((nn) => nn.id === id);
      if (!n || (n.data as { kind?: string }).kind !== "union") return false;
      if ((n.data as UnionNodeData)?.isMainGraph) return false;
      if (!contextFamily) return false;
      return isUnionClusterUnassigned(id, contextFamily, nodes, edges);
    });
    if (selectedUnions.length > 0 && contextFamily) {
      const { restrictPersonIds, error } = resolveTransferPersonRestriction(selectedUnions);
      if (error) {
        setTransferMemberError(true);
        return;
      }
      const { blockedUnionIds, reducedUnionIds } = computeAnchorBlockedUnionIds(
        selectedUnions,
        nodes,
        edges
      );
      if (blockedUnionIds.length > 0) {
        setAnchorBlockConfirm({
          reducedUnionIds,
          sourceFamilyId: contextFamily.id,
          restrictPersonIds,
        });
        return;
      }
      proceedWithUnionTransfer(selectedUnions, contextFamily.id, restrictPersonIds);
      return;
    }
    const selectedPersons = selectedNodeIds.filter((id) => {
      const n = nodes.find((nn) => nn.id === id);
      if (!n || (n.data as { kind?: string }).kind !== "person") return false;
      if (!contextFamily) return false;
      const analysis = computeFamilyClusterAnalysis(contextFamily, nodes, edges);
      return analysis.unionlessPersonIds.includes(id);
    });
    if (selectedPersons.length > 0 && contextFamily) {
      const newFamilyId = createFamily();
      moveNodesToFamily(selectedPersons, newFamilyId);
      return;
    }
    createFamily();
  };

  const handleUnassignedClick = (e: React.MouseEvent, id: string) => {
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const node = nodes.find((n) => n.id === id);
      const isUnion = node?.type === "union";
      const selectionIds = isUnion ? unassignedUnionSelectionIds(id) : [id];

      if (placementTargetId === id) {
        setPlacementTargetId(null);
        return;
      }
      const isSoleSelection = isSameSelectionSet(selectedNodeIds, selectionIds);
      if (isSoleSelection) {
        setPlacementTargetId(id);
        return;
      }
      if (placementTargetId) setPlacementTargetId(null);
      setSelectedNodeIds(selectionIds);
      setLastEntityClickedId(id);
      onSelectNode?.();
      return;
    }
    handleSidebarEntityClick(e, id);
  };

  const startEditingPerson = (e: React.MouseEvent, personId: string, currentName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingPersonId(personId);
    setDraftName(currentName);
  };

  const savePersonName = (personId: string) => {
    const trimmed = draftName.trim() || "New Person";
    updateNodeName(personId, trimmed);
    setEditingPersonId(null);
  };

  const cancelEditing = () => {
    setEditingPersonId(null);
  };

  const hasSelection = selectedNodeIds.length > 0;
  const canDeleteFamily = focusIsFamily && activeFamilyTabId != null && editingPersonId == null;
  const canDeleteNodes = !focusIsFamily && hasSelection && editingPersonId == null;
  const canDelete = canDeleteFamily || canDeleteNodes;

  const selectedKinds = selectedNodeIds.map(
    (id) => (nodes.find((n) => n.id === id)?.data as { kind?: string })?.kind
  );
  const allUnions = selectedKinds.length > 0 && selectedKinds.every((k) => k === "union");
  const allPersons = selectedKinds.length > 0 && selectedKinds.every((k) => k === "person");
  const deleteLabel = canDeleteFamily
    ? "Delete family"
    : canDeleteNodes
      ? allUnions
        ? selectedNodeIds.length === 1
          ? "Delete union"
          : "Delete unions"
        : allPersons
          ? selectedNodeIds.length === 1
            ? "Delete person"
            : "Delete people"
          : "Delete"
      : "Delete";

  const handleDeleteClick = () => {
    if (!canDelete) return;
    requestDeleteSelection();
  };

  const confirmMessage = (() => {
    if (!pendingDeleteConfirm) return "";
    if (pendingDeleteConfirm.kind === "family") {
      const family = families.find((f) => f.id === pendingDeleteConfirm.familyId);
      if (!family) return "Delete this family? This cannot be undone.";
      const memberIds = getFamilyVisibleNodeIds(family, nodes, edges);
      const personCount = memberIds.filter(
        (id) => (nodes.find((n) => n.id === id)?.data as { kind?: string })?.kind === "person"
      ).length;
      const unionCount = memberIds.filter(
        (id) => (nodes.find((n) => n.id === id)?.data as { kind?: string })?.kind === "union"
      ).length;
      const parts: string[] = [];
      if (personCount > 0) parts.push(`${personCount} ${personCount === 1 ? "person" : "people"}`);
      if (unionCount > 0) parts.push(`${unionCount} ${unionCount === 1 ? "union" : "unions"}`);
      const memberSummary = parts.length > 0 ? ` and its ${parts.join(" and ")}` : "";
      return `Delete "${family.name}"${memberSummary}? This cannot be undone.`;
    }
    const ids = pendingDeleteConfirm.nodeIds;
    if (ids.length === 1) {
      const id = ids[0]!;
      const node = nodes.find((n) => n.id === id);
      const kind = (node?.data?.kind ?? "person") as "person" | "union";
      const name = getDisplayName(nodes, id, kind);
      return `Delete ${name}? This will remove them and their connections. This action cannot be undone.`;
    }
    return `Delete ${ids.length} selected entities? This will remove them and their connections. This action cannot be undone.`;
  })();

  const toggleFamilyGroup = (groupId: string) => {
    setExpandedFamilyGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  if (textEditorMode) {
    const renderFileRow = (doc: { id: string; name: string }) => {
      const isActive = activeFileId === doc.id;
      const isOpen = openFileIds.includes(doc.id);
      const dirty = dirtyDocIds.has(doc.id);
      return (
        <div
          key={doc.id}
          className={`flex items-center gap-1 rounded border overflow-hidden ${
            isActive
              ? "border-blue-500/50 ring-1 ring-blue-500/50"
              : isOpen
                ? "border-dark-accent/50"
                : "border-dark-accent/30"
          }`}
        >
          <button
            type="button"
            onClick={() => onOpenFile?.(doc.id)}
            className="flex-1 min-w-0 text-left px-2 py-1.5 text-xs text-dark-text hover:bg-dark-accent/40 truncate"
            title={doc.name}
          >
            {dirty && <span className="text-amber-400 mr-1">●</span>}
            {doc.name}
          </button>
          <button
            type="button"
            onClick={() => onDeleteUserFile?.(doc.id)}
            className="flex-shrink-0 px-1.5 py-1 text-dark-muted hover:text-red-400 hover:bg-dark-accent/40"
            title="Delete file"
          >
            ×
          </button>
        </div>
      );
    };

    const renderFamilyGroup = (
      groupId: string,
      label: string,
      familyDocs: typeof documents,
      ownerFamilyId: string | null
    ) => {
      const isExpanded = expandedFamilyGroups.has(groupId);
      return (
        <div key={groupId} className="rounded-lg border border-dark-accent/30 overflow-hidden">
          <div className="flex items-center gap-1 bg-dark-bg/40 px-2 py-1.5">
            <button
              type="button"
              onClick={() => toggleFamilyGroup(groupId)}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-dark-muted hover:text-dark-text"
              aria-expanded={isExpanded}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
            <span className="flex-1 min-w-0 text-xs font-medium text-dark-text truncate">{label}</span>
            <button
              type="button"
              onClick={() => onNewUserFile?.(ownerFamilyId)}
              className="flex-shrink-0 text-[11px] text-blue-300 hover:text-blue-200 px-1.5 py-0.5"
              title={`New file in ${label}`}
            >
              + File
            </button>
          </div>
          {isExpanded && (
            <div className="px-2 pb-2 pt-1 space-y-1">
              {familyDocs.length === 0 ? (
                <p className="text-dark-muted text-[10px] px-1 py-1">No files</p>
              ) : (
                familyDocs.map(renderFileRow)
              )}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="w-full min-w-0 flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden h-full">
        <div className="p-4 border-b border-dark-accent/50 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
              Sub Entities
            </h2>
            <p className="text-dark-muted text-xs mt-1">Families → Files</p>
          </div>
          <button
            type="button"
            onClick={() => createFamily()}
            className="flex-shrink-0 text-[11px] text-blue-300 hover:text-blue-200 px-2 py-1 rounded border border-dark-accent/50"
            title="New family folder"
          >
            + Folder
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {families.length === 0 && documents.length === 0 ? (
            <p className="text-dark-muted text-xs py-2 px-2">
              No script files yet. Add people and unions on the canvas, or switch to Script mode to
              auto-create files per family.
            </p>
          ) : (
            <>
              {families.map((family) =>
                renderFamilyGroup(
                  family.id,
                  family.name,
                  getDocumentsForFamily(documents, family.id, families, nodes, edges),
                  family.id
                )
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden">
      <div className="p-4 border-b border-dark-accent/50">
        <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
          Sub Entities
        </h2>
        <p className="text-dark-muted text-xs mt-1">Family units and unassigned people</p>
      </div>
      <div className="p-3 border-b border-dark-accent/50">
        <input
          type="text"
          placeholder="Search..."
          className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm placeholder-dark-muted focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          readOnly
        />
      </div>
      <div className="px-3 py-2 border-b border-dark-accent/50 flex items-center gap-2 min-w-0">
        <button
          type="button"
          title={isolationModeActive ? "Exit isolation mode" : "Isolation mode — hide other families on canvas"}
          disabled={activeFamilyTabId == null}
          onClick={() => setIsolationModeActive(!isolationModeActive)}
          className={`flex-shrink-0 px-2 py-1 rounded-md border text-xs font-medium transition-colors ${
            isolationModeActive
              ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
              : "border-dark-accent/50 text-dark-muted hover:text-dark-text hover:bg-dark-accent/30 disabled:opacity-40 disabled:cursor-not-allowed"
          }`}
        >
          Isolate
        </button>
        <div
          role="tablist"
          aria-label="Family tabs"
          className="flex-1 min-w-0 overflow-x-auto flex gap-1 pb-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeFamilyTabId == null}
            onClick={() => handleFamilyTabClick(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeFamilyTabId == null
                ? focusIsFamily
                  ? "bg-dark-accent text-dark-text"
                  : "bg-dark-accent/40 text-dark-muted"
                : "text-dark-muted hover:text-dark-text hover:bg-dark-accent/40"
            }`}
          >
            All
          </button>
          {families.map((family) => (
            <button
              key={family.id}
              type="button"
              role="tab"
              aria-selected={activeFamilyTabId === family.id}
              onClick={() => handleFamilyTabClick(family.id)}
              onDoubleClick={(e) => handleFamilyTabDoubleClick(e, family.id)}
              title="Double-click to open in Inspector"
              className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeFamilyTabId === family.id
                  ? focusIsFamily
                    ? "bg-dark-accent text-dark-text"
                    : "bg-dark-accent/40 text-dark-muted"
                  : "text-dark-muted hover:text-dark-text hover:bg-dark-accent/40"
              }`}
            >
              {family.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          title="New family tab (or move shift-selected unassigned unions)"
          onClick={handleAddFamily}
          className="flex-shrink-0 w-7 h-7 rounded-md border border-dark-accent/50 text-dark-muted hover:text-dark-text hover:bg-dark-accent/30 text-sm font-medium"
        >
          +
        </button>
      </div>
      {placementTargetId != null && (() => {
        const armedNode = nodes.find((n) => n.id === placementTargetId);
        const armedKind = (armedNode?.data as { kind?: string })?.kind ?? "person";
        const armedName = armedNode
          ? getDisplayName(nodes, placementTargetId, armedKind === "union" ? "union" : "person")
          : placementTargetId;
        const ownerFamily = findFamilyForNode(placementTargetId, families);
        const isCrossFamily =
          ownerFamily != null &&
          activeFamilyTabId != null &&
          ownerFamily.id !== activeFamilyTabId;
        const targetFamilyName = activeFamily?.name ?? "active family";
        const hint = isCrossFamily
          ? `Click canvas to move into ${targetFamilyName}`
          : "Click canvas to place";
        return (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/30 bg-amber-500/10 flex-shrink-0">
            <span className="text-[10px] text-amber-400 font-medium uppercase tracking-wide flex-shrink-0">
              Placing
            </span>
            <span className="text-xs text-dark-text truncate flex-1 min-w-0" title={armedName}>
              {armedName}
            </span>
            <span className="text-[10px] text-dark-muted truncate flex-shrink-0 max-w-[45%]" title={hint}>
              {hint}
            </span>
            <button
              type="button"
              title="Cancel placement"
              onClick={() => setPlacementTargetId(null)}
              className="flex-shrink-0 w-5 h-5 rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/40 text-sm leading-none"
            >
              ×
            </button>
          </div>
        );
      })()}
      <div className="flex-1 min-h-0 flex flex-col">
        <div
          className="flex-1 overflow-y-auto p-2"
          onClick={(e) => {
            if (
              (e.target as HTMLElement).closest(
                "button, [role='button'], input, select, textarea, a"
              )
            ) {
              return;
            }
            if (placementTargetId) setPlacementTargetId(null);
            setSelectedNodeIds([]);
            setLastEntityClickedId(null);
          }}
        >
        {visibleBranches.length > 0 && (
          <section className="mb-3">
            <h3 className="text-xs font-medium text-dark-muted uppercase tracking-wide mb-2 px-1">
              Branches
            </h3>
            <div className="space-y-1">
              {visibleBranches.map((branch) => {
                if (branch.mode === "hidden") {
                  const rootName = getBranchRootName(branch.rootPersonId);
                  return (
                    <div
                      key={branch.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-accent/20 border border-dark-accent/30"
                    >
                      <span className="flex-1 min-w-0 text-sm text-dark-muted truncate">
                        {rootName} (hidden)
                      </span>
                      <button
                        type="button"
                        title="Unhide branch"
                        onClick={() => deleteBranch(branch.id)}
                        className="flex-shrink-0 p-1 text-dark-muted hover:text-blue-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                    </div>
                  );
                }

                const isActiveBranch = activeBranchTabId === branch.id;
                if (editingBranchId === branch.id) {
                  return (
                    <div
                      key={branch.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                        isActiveBranch ? "bg-blue-500/20 ring-1 ring-blue-500/50" : "bg-dark-accent/30"
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={branchDraftName}
                        onChange={(e) => setBranchDraftName(e.target.value)}
                        onBlur={() => saveBranchName(branch.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveBranchName(branch.id);
                          if (e.key === "Escape") cancelBranchEditing();
                        }}
                        autoFocus
                        className="flex-1 min-w-0 px-2 py-0.5 text-sm bg-dark-bg border border-blue-500 rounded text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  );
                }

                return (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => handleBranchTabClick(branch.id)}
                    onDoubleClick={(e) => handleBranchTabDoubleClick(e, branch.id)}
                    title="Double-click to open in Inspector; double-click name to rename"
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm transition-colors ${
                      isActiveBranch
                        ? "bg-blue-500/20 ring-1 ring-blue-500/50 text-blue-300"
                        : "text-dark-text hover:bg-dark-accent/30"
                    }`}
                  >
                    <span
                      className="flex-1 min-w-0 truncate"
                      onDoubleClick={(e) => startEditingBranch(e, branch.id, branch.name)}
                    >
                      {branch.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {filteredFamilyUnits.length === 0 && filteredUnassignedEntities.length === 0 ? (
          <p className="text-dark-muted text-sm py-4 text-center">No entities yet.</p>
        ) : (
          <div className="space-y-3">
            {filteredFamilyUnits.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-xs font-medium text-dark-muted uppercase tracking-wide">
                    Family Units
                  </h3>
                  <button
                    type="button"
                    onClick={handleCollapseExpandAll}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {collapseAllActive ? "Expand All" : "Collapse All"}
                  </button>
                </div>
                <div className="space-y-2">
                  {filteredFamilyUnits.map((unit) => {
                    const [leftId, rightId] = unit.parents;
                    const leftName = getPersonName(nodes, leftId);
                    const rightName = getPersonName(nodes, rightId);
                    const isCollapsed = collapsedUnits.has(unit.unionId);
                    const unionData = nodes.find((n) => n.id === unit.unionId)?.data as UnionNodeData | undefined;
                    let styleLabel: string | null = null;
                    if (unionData?.connectionStyleOverride) {
                      styleLabel = "Custom";
                    } else if (unionData?.connectionStyleId) {
                      const style = connectionStyles.find((s) => s.id === unionData.connectionStyleId);
                      if (style) styleLabel = style.name;
                    }

                    return (
                      <div
                        key={unit.unionId}
                        className="rounded-xl border border-dark-accent/30 bg-dark-bg/50 overflow-hidden"
                      >
                        <div className="flex items-center gap-2 px-3 py-2 bg-dark-accent/20">
                          <button
                            type="button"
                            onClick={() => toggleUnit(unit.unionId)}
                            className="p-0.5 text-dark-muted hover:text-dark-text transition-transform"
                          >
                            <span className={isCollapsed ? "" : "inline-block rotate-90"}>▶</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleSidebarEntityClick(e, unit.unionId)}
                            onDoubleClick={(e) => handleUnionDoubleClick(e, unit.unionId)}
                            title={`${leftName} ↔ ${rightName}`}
                            className={`flex-1 min-w-0 text-left text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap hover:text-blue-400 ${unionRowSelectedClass(unit.unionId)}`}
                          >
                            {leftName} ↔ {rightName}
                          </button>
                          {unionData?.isMainGraph && (
                            <span
                              title="Main graph for this family"
                              className="flex-shrink-0 flex items-center justify-center w-4 h-4 text-amber-300"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                <path d="M5 16l3-9 4 5 3-4 4 8H5zm2.5-2h9l-2.2-4.4-2.8 3.5L9.5 9 7.5 14z" />
                              </svg>
                            </span>
                          )}
                          {unionData?.familyLocked && (
                            <span
                              title="Family group locked (members drag together)"
                              className="flex-shrink-0 flex items-center justify-center w-4 h-4 text-amber-400"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <rect x="5" y="11" width="14" height="9" rx="1.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 018 0v4" />
                              </svg>
                            </span>
                          )}
                          {nameRoleSuggestions.some(
                            (s) => s.field === "genConflict" && s.unionId === unit.unionId
                          ) && (
                            <HazardTriangleIcon
                              title={
                                nameRoleSuggestions.find(
                                  (s) => s.field === "genConflict" && s.unionId === unit.unionId
                                )?.reason ?? "Parent and child share the same generation"
                              }
                            />
                          )}
                          {nameRoleSuggestions.some(
                            (s) => s.field === "unionHealth" && s.unionId === unit.unionId
                          ) && (
                            <HazardTriangleIcon
                              title={
                                nameRoleSuggestions.find(
                                  (s) => s.field === "unionHealth" && s.unionId === unit.unionId
                                )?.reason ?? "Union health issue"
                              }
                            />
                          )}
                          {(() => {
                            const ownerFamily = findFamilyForNode(unit.unionId, families);
                            return ownerFamily
                              ? getFamilyNodeWarnings(unit.unionId, ownerFamily, nodes, edges).map(
                                  (w) => <HazardTriangleIcon key={w} title={w} />
                                )
                              : null;
                          })()}
                          {styleLabel && (
                            <span className="text-[10px] text-dark-muted px-1.5 py-0.5 rounded bg-dark-accent/40 flex-shrink-0">
                              {styleLabel}
                            </span>
                          )}
                        </div>
                        {!isCollapsed && (
                          <div className="px-3 pb-2 space-y-1">
                            <p className="text-dark-muted text-[10px] uppercase mt-1 px-1">
                              Parents
                            </p>
                            {editingPersonId === leftId ? (
                              <div
                                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg min-w-0 ${personRowSelectedClass(leftId)}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="w-5 h-5 rounded-full bg-dark-accent flex-shrink-0" />
                                <input
                                  type="text"
                                  value={draftName}
                                  onChange={(e) => setDraftName(e.target.value)}
                                  onBlur={() => savePersonName(leftId)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") savePersonName(leftId);
                                    if (e.key === "Escape") cancelEditing();
                                  }}
                                  autoFocus
                                  className="flex-1 min-w-0 px-2 py-0.5 text-sm bg-dark-bg border border-blue-500 rounded text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <PersonGenBadge personId={leftId} nodes={nodes} getPersonGenLabel={getPersonGenLabel} />
                                <AnchorDot personId={leftId} nodes={nodes} />
                                <EntityFamilyWarnings nodeId={leftId} family={activeFamily} nodes={nodes} edges={edges} />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleSidebarEntityClick(e, leftId)}
                                onDoubleClick={(e) => handlePersonRowDoubleClick(e, leftId)}
                                title={leftName}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left min-w-0 ${personRowSelectedClass(leftId, "hover:bg-dark-accent/30")}`}
                              >
                                <div className="w-5 h-5 rounded-full bg-dark-accent flex-shrink-0" />
                                <span className="flex-1 min-w-0 overflow-hidden">
                                  <span
                                    onDoubleClick={(e) => startEditingPerson(e, leftId, leftName)}
                                    className="text-dark-text text-sm inline-block max-w-full align-middle overflow-hidden text-ellipsis whitespace-nowrap"
                                  >
                                    {leftName}
                                  </span>
                                </span>
                                <PersonGenBadge personId={leftId} nodes={nodes} getPersonGenLabel={getPersonGenLabel} />
                                <AnchorDot personId={leftId} nodes={nodes} />
                                <EntityFamilyWarnings nodeId={leftId} family={activeFamily} nodes={nodes} edges={edges} />
                              </button>
                            )}
                            {editingPersonId === rightId ? (
                              <div
                                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg min-w-0 ${personRowSelectedClass(rightId)}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="w-5 h-5 rounded-full bg-dark-accent flex-shrink-0" />
                                <input
                                  type="text"
                                  value={draftName}
                                  onChange={(e) => setDraftName(e.target.value)}
                                  onBlur={() => savePersonName(rightId)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") savePersonName(rightId);
                                    if (e.key === "Escape") cancelEditing();
                                  }}
                                  autoFocus
                                  className="flex-1 min-w-0 px-2 py-0.5 text-sm bg-dark-bg border border-blue-500 rounded text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <PersonGenBadge personId={rightId} nodes={nodes} getPersonGenLabel={getPersonGenLabel} />
                                <AnchorDot personId={rightId} nodes={nodes} />
                                <EntityFamilyWarnings nodeId={rightId} family={activeFamily} nodes={nodes} edges={edges} />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleSidebarEntityClick(e, rightId)}
                                onDoubleClick={(e) => handlePersonRowDoubleClick(e, rightId)}
                                title={rightName}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left min-w-0 ${personRowSelectedClass(rightId, "hover:bg-dark-accent/30")}`}
                              >
                                <div className="w-5 h-5 rounded-full bg-dark-accent flex-shrink-0" />
                                <span className="flex-1 min-w-0 overflow-hidden">
                                  <span
                                    onDoubleClick={(e) => startEditingPerson(e, rightId, rightName)}
                                    className="text-dark-text text-sm inline-block max-w-full align-middle overflow-hidden text-ellipsis whitespace-nowrap"
                                  >
                                    {rightName}
                                  </span>
                                </span>
                                <PersonGenBadge personId={rightId} nodes={nodes} getPersonGenLabel={getPersonGenLabel} />
                                <AnchorDot personId={rightId} nodes={nodes} />
                                <EntityFamilyWarnings nodeId={rightId} family={activeFamily} nodes={nodes} edges={edges} />
                              </button>
                            )}
                            {unit.children.length > 0 && (
                              <>
                                <p className="text-dark-muted text-[10px] uppercase mt-2 px-1">
                                  Children
                                </p>
                                {unit.children.map((childId) => {
                                  const name = getPersonName(nodes, childId);
                                  return (
                                    <div key={childId}>
                                      {editingPersonId === childId ? (
                                        <div
                                          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg pl-6 min-w-0 ${personRowSelectedClass(childId)}`}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <div className="w-5 h-5 rounded-full bg-dark-accent/70 flex-shrink-0" />
                                          <input
                                            type="text"
                                            value={draftName}
                                            onChange={(e) => setDraftName(e.target.value)}
                                            onBlur={() => savePersonName(childId)}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") savePersonName(childId);
                                              if (e.key === "Escape") cancelEditing();
                                            }}
                                            autoFocus
                                            className="flex-1 min-w-0 px-2 py-0.5 text-sm bg-dark-bg border border-blue-500 rounded text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-500"
                                          />
                                          <PersonGenBadge personId={childId} nodes={nodes} getPersonGenLabel={getPersonGenLabel} />
                                          <AnchorDot personId={childId} nodes={nodes} />
                                          <EntityFamilyWarnings nodeId={childId} family={activeFamily} nodes={nodes} edges={edges} />
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={(e) => handleSidebarEntityClick(e, childId)}
                                          onDoubleClick={(e) => handlePersonRowDoubleClick(e, childId)}
                                          title={name}
                                          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left pl-6 min-w-0 ${personRowSelectedClass(childId, "hover:bg-dark-accent/30")}`}
                                        >
                                          <div className="w-5 h-5 rounded-full bg-dark-accent/70 flex-shrink-0" />
                                          <span className="flex-1 min-w-0 overflow-hidden">
                                            <span
                                              onDoubleClick={(e) => startEditingPerson(e, childId, name)}
                                              className="text-dark-text text-sm inline-block max-w-full align-middle overflow-hidden text-ellipsis whitespace-nowrap"
                                            >
                                              {name}
                                            </span>
                                          </span>
                                          <PersonGenBadge personId={childId} nodes={nodes} getPersonGenLabel={getPersonGenLabel} />
                                          <AnchorDot personId={childId} nodes={nodes} />
                                          <EntityFamilyWarnings nodeId={childId} family={activeFamily} nodes={nodes} edges={edges} />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {filteredUnassignedEntities.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-dark-muted uppercase tracking-wide mb-2 px-1">
                  Unassigned
                </h3>
                <div className="space-y-1">
                  {filteredUnassignedEntities.map((node) => {
                    const isPerson = node.data.kind === "person";
                    const name = isPerson
                      ? (node.data as PersonNodeData).name || "New Person"
                      : getDisplayName(nodes, node.id, "union");
                    const reasons = getUnassignedReasons(node.id, nodes, edges, families);
                    const docRefs = getDocumentRefsForNode(node.id, documents);
                    const tooltip = [
                      ...(reasons.length > 0 ? reasons : [name]),
                      docRefs.declaredIn ? `Declared in: ${docRefs.declaredIn}` : null,
                    ]
                      .filter(Boolean)
                      .join("; ");
                    const isArmed = placementTargetId === node.id;
                    return (
                      <div key={node.id}>
                        {isPerson && editingPersonId === node.id ? (
                          <div
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border min-w-0 ${unassignedRowSelectedClass(node.id)}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="w-6 h-6 rounded-full bg-dark-accent flex-shrink-0" />
                            <input
                              type="text"
                              value={draftName}
                              onChange={(e) => setDraftName(e.target.value)}
                              onBlur={() => savePersonName(node.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") savePersonName(node.id);
                                if (e.key === "Escape") cancelEditing();
                              }}
                              autoFocus
                              className="flex-1 min-w-0 px-2 py-1 text-sm bg-dark-bg border border-blue-500 rounded text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleUnassignedClick(e, node.id)}
                            onDoubleClick={
                              isPerson
                                ? (e) => handlePersonRowDoubleClick(e, node.id)
                                : (e) => handleUnionDoubleClick(e, node.id)
                            }
                            title={tooltip}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors text-left cursor-pointer min-w-0 ${
                              isArmed
                                ? "border-amber-500 bg-amber-500/15 ring-1 ring-amber-500/40"
                                : isSelected(node.id)
                                  ? unassignedRowSelectedClass(node.id)
                                  : "border-dark-accent/30 hover:bg-dark-accent/30"
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-full flex-shrink-0 ${isPerson ? "bg-dark-accent" : "bg-dark-accent/60"}`} />
                            <div className="flex-1 min-w-0">
                              <span className="block overflow-hidden">
                                <span
                                  onDoubleClick={
                                    isPerson
                                      ? (e) => startEditingPerson(e, node.id, name)
                                      : undefined
                                  }
                                  className="text-dark-text text-sm inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                                >
                                  {name}
                                </span>
                              </span>
                              <span className="text-[10px] text-dark-muted block truncate">
                                {node.id}
                                {docRefs.declaredIn ? ` · ${docRefs.declaredIn}` : ""}
                              </span>
                            </div>
                            {isArmed ? (
                              <span className="text-[10px] text-amber-400 flex-shrink-0">Click canvas</span>
                            ) : null}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
        </div>

        <div className="p-3 border-t border-dark-accent/50 flex-shrink-0 flex items-center gap-2">
          <div className="flex rounded-lg border border-dark-accent/50 overflow-hidden flex-shrink-0">
            <button
              type="button"
              onClick={() => setSubEntitySelectionMode("node")}
              className={`px-2 py-1.5 text-[10px] font-medium transition-colors ${
                subEntitySelectionMode === "node"
                  ? "bg-dark-accent text-dark-text"
                  : "text-dark-muted hover:text-dark-text hover:bg-dark-accent/40"
              }`}
              title="Select individual nodes"
            >
              Node
            </button>
            <button
              type="button"
              onClick={() => setSubEntitySelectionMode("union")}
              className={`px-2 py-1.5 text-[10px] font-medium transition-colors border-l border-dark-accent/50 ${
                subEntitySelectionMode === "union"
                  ? "bg-dark-accent text-dark-text"
                  : "text-dark-muted hover:text-dark-text hover:bg-dark-accent/40"
              }`}
              title="Select whole unions at a time"
            >
              Union
            </button>
          </div>
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={!canDelete}
            className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent border-dark-accent/50 text-dark-muted hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/10"
            title={
              canDeleteFamily
                ? "Delete active family tab and its members"
                : canDeleteNodes
                  ? "Delete selected entities"
                  : focusIsFamily && activeFamilyTabId == null
                    ? "Select a family tab or nodes to delete"
                    : "Select entities to delete"
            }
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="truncate">{deleteLabel}</span>
          </button>
        </div>
      </div>

      {pendingDeleteConfirm &&
        createPortal(
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
            <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 max-w-sm mx-4 shadow-lg">
              <p className="text-sm text-dark-text mb-3">{confirmMessage}</p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={cancelPendingDelete}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={confirmPendingDelete}>
                  Delete
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {transferConfirm &&
        createPortal(
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
            <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 max-w-sm mx-4 shadow-lg">
              <p className="text-sm text-dark-text mb-3">
                {transferConfirm.kind === "partial"
                  ? `Moving ${transferConfirm.unionIds.length} union${
                      transferConfirm.unionIds.length === 1 ? "" : "s"
                    } to a new family will break connections between selected and unselected unions in this tab. Continue?`
                  : `Move ${transferConfirm.unionIds.length} lone union${
                      transferConfirm.unionIds.length === 1 ? "" : "s"
                    } to a new family?`}
              </p>
              <label className="flex items-start gap-2 text-sm text-dark-text mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createEmptyInstead}
                  onChange={(e) => setCreateEmptyInstead(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Do not move selected unions; create new empty family tab</span>
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setTransferConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (createEmptyInstead) {
                      createFamily();
                    } else {
                      transferUnionsToNewFamily(
                        transferConfirm.unionIds,
                        transferConfirm.sourceFamilyId,
                        transferConfirm.restrictPersonIds
                      );
                    }
                    setTransferConfirm(null);
                  }}
                >
                  {createEmptyInstead ? "Create new family" : "Move to new family"}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {transferMemberError &&
        createPortal(
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
            <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 max-w-sm mx-4 shadow-lg">
              <p className="text-sm text-dark-text mb-4">
                At least one union member must be selected to qualify for transfer
              </p>
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={() => setTransferMemberError(false)}>
                  OK
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {anchorBlockConfirm &&
        createPortal(
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
            <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 max-w-sm mx-4 shadow-lg">
              <p className="text-sm text-dark-text mb-3">
                The current selection contains an anchored node; it, its partner, and children will
                not be transferred.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setAnchorBlockConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    proceedWithUnionTransfer(
                      anchorBlockConfirm.reducedUnionIds,
                      anchorBlockConfirm.sourceFamilyId,
                      anchorBlockConfirm.restrictPersonIds
                    );
                    setAnchorBlockConfirm(null);
                  }}
                >
                  Proceed
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {pendingAnchorTransferWarning &&
        createPortal(
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
            <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 max-w-sm mx-4 shadow-lg">
              <p className="text-sm text-dark-text mb-3">
                The current selection contains an anchored node; it, its partner, and children will
                not be transferred.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => resolveAnchorTransferWarning("cancel")}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => resolveAnchorTransferWarning("proceed")}
                >
                  Proceed
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
