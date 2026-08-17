import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Node, Edge } from "reactflow";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import type { PersonNodeData, UnionNodeData } from "../../store/familyTreeStore";
import { formatGenerationAnchorLabel, getPersonDisplayName, isChildEdge, computeBranchMemberIds } from "../../store/familyTreeStore";
import {
  getDocumentsForFamily,
  getUnassignedDocuments,
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
}: {
  personId: string;
  nodes: Node<PersonNodeData | UnionNodeData>[];
  getPersonGenLabel: (id: string) => string | null;
  pill?: boolean;
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
  const node = nodes.find((n) => n.id === personId && (n.data as { kind?: string }).kind === "person");
  const genAnchorId = (node?.data as PersonNodeData)?.genAnchorId;
  if (!genAnchorId) {
    return <HazardTriangleIcon title="No generation assigned" />;
  }
  return null;
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
  const updateNodeName = useFamilyTreeStore((s) => s.updateNodeName);
  const requestRemoveConnection = useFamilyTreeStore((s) => s.requestRemoveConnection);
  const families = useFamilyTreeStore((s) => s.families);
  const activeFamilyTabId = useFamilyTreeStore((s) => s.activeFamilyTabId);
  const setActiveFamilyTabId = useFamilyTreeStore((s) => s.setActiveFamilyTabId);
  const isolationModeActive = useFamilyTreeStore((s) => s.isolationModeActive);
  const setIsolationModeActive = useFamilyTreeStore((s) => s.setIsolationModeActive);
  const setPendingFocusFamilyId = useFamilyTreeStore((s) => s.setPendingFocusFamilyId);
  const setInspectorFamilyId = useFamilyTreeStore((s) => s.setInspectorFamilyId);
  const branches = useFamilyTreeStore((s) => s.branches);
  const activeBranchTabId = useFamilyTreeStore((s) => s.activeBranchTabId);
  const setActiveBranchTabId = useFamilyTreeStore((s) => s.setActiveBranchTabId);
  const setPendingFocusBranchId = useFamilyTreeStore((s) => s.setPendingFocusBranchId);
  const setInspectorBranchId = useFamilyTreeStore((s) => s.setInspectorBranchId);
  const deleteBranch = useFamilyTreeStore((s) => s.deleteBranch);
  const setBranchCustomName = useFamilyTreeStore((s) => s.setBranchCustomName);
  const [collapsedUnits, setCollapsedUnits] = useState<Set<string>>(new Set());
  const [lastEntityClickedId, setLastEntityClickedId] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchDraftName, setBranchDraftName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [collapseAllActive, setCollapseAllActive] = useState(false);
  const [expandedFamilyGroups, setExpandedFamilyGroups] = useState<Set<string>>(
    () => new Set(["__all__", "__unassigned__"])
  );

  const isSelected = (id: string) => selectedNodeIds.includes(id);

  const { familyUnits, unlinkedPeople } = useMemo(() => {
    const { units, linkedPersonIds } = buildFamilyUnits(nodes, edges);

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

    const unlinked = personNodes
      .filter((n) => !linkedPersonIds.has(n.id))
      .sort((a, b) => {
        const nameA = (a.data.name || "New Person").toLowerCase();
        const nameB = (b.data.name || "New Person").toLowerCase();
        const cmp = nameA.localeCompare(nameB);
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id);
      });

    return { familyUnits: unitsWithSortedChildren, unlinkedPeople: unlinked };
  }, [nodes, edges]);

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

  const filteredUnlinkedPeople = useMemo(() => {
    if (branchMemberIds) {
      return unlinkedPeople.filter((p) => branchMemberIds.has(p.id));
    }
    if (activeFamilyTabId != null) return [];
    return unlinkedPeople;
  }, [unlinkedPeople, activeFamilyTabId, branchMemberIds]);

  const visibleEntityOrder = useMemo(() => {
    const order: string[] = [];
    for (const unit of filteredFamilyUnits) {
      order.push(unit.unionId);
      if (!collapsedUnits.has(unit.unionId)) {
        order.push(unit.parents[0], unit.parents[1], ...unit.children);
      }
    }
    for (const p of filteredUnlinkedPeople) {
      order.push(p.id);
    }
    return order;
  }, [filteredFamilyUnits, filteredUnlinkedPeople, collapsedUnits]);

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
  const canDelete = hasSelection && editingPersonId == null;

  const handleDeleteClick = () => {
    if (!canDelete) return;
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    for (const id of selectedNodeIds) {
      const node = nodes.find((n) => n.id === id);
      const kind = (node?.data as { kind?: string })?.kind;
      const target =
        kind === "union"
          ? ({ kind: "union" as const, unionId: id })
          : ({ kind: "person" as const, personId: id });
      const err = requestRemoveConnection(target);
      if (err) alert(err);
      if (useFamilyTreeStore.getState().pendingBloodlineWarning) break;
    }
    setDeleteConfirmOpen(false);
  };

  const confirmMessage =
    selectedNodeIds.length === 1
      ? (() => {
          const id = selectedNodeIds[0]!;
          const node = nodes.find((n) => n.id === id);
          const kind = (node?.data?.kind ?? "person") as "person" | "union";
          const name = getDisplayName(nodes, id, kind);
          return `Delete ${name}? This will remove them and their connections. This action cannot be undone.`;
        })()
      : `Delete ${selectedNodeIds.length} selected entities? This will remove them and their connections. This action cannot be undone.`;

  const toggleFamilyGroup = (groupId: string) => {
    setExpandedFamilyGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const unassignedDocs = useMemo(
    () => getUnassignedDocuments(documents, families, nodes, edges),
    [documents, families, nodes, edges]
  );

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
        <div className="p-4 border-b border-dark-accent/50">
          <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
            Sub Entities
          </h2>
          <p className="text-dark-muted text-xs mt-1">Families → Files</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {families.length === 0 && unassignedDocs.length === 0 && documents.length === 0 ? (
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
              {(unassignedDocs.length > 0 || families.length > 0) &&
                renderFamilyGroup("__unassigned__", "Unassigned", unassignedDocs, null)}
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
        <p className="text-dark-muted text-xs mt-1">Family units and unlinked people</p>
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
                ? "bg-dark-accent text-dark-text"
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
                    ? "bg-dark-accent text-dark-text"
                    : "text-dark-muted hover:text-dark-text hover:bg-dark-accent/40"
                }`}
              >
                {family.name}
              </button>
            ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto p-2">
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
        {filteredFamilyUnits.length === 0 && filteredUnlinkedPeople.length === 0 ? (
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
                            onClick={(e) => handleEntityClick(e, unit.unionId)}
                            title={`${leftName} ↔ ${rightName}`}
                            className={`flex-1 min-w-0 text-left text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap hover:text-blue-400 ${
                              isSelected(unit.unionId)
                                ? "text-blue-400 bg-blue-500/20 ring-1 ring-blue-500/50 rounded px-1 -mx-1"
                                : "text-dark-text"
                            }`}
                          >
                            {leftName} ↔ {rightName}
                          </button>
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
                                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg min-w-0 ${
                                  isSelected(leftId) ? "bg-blue-500/20 ring-1 ring-blue-500/50" : "bg-dark-accent/30"
                                }`}
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
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleEntityClick(e, leftId)}
                                onDoubleClick={(e) => startEditingPerson(e, leftId, leftName)}
                                title={leftName}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left min-w-0 ${
                                  isSelected(leftId)
                                    ? "bg-blue-500/20 ring-1 ring-blue-500/50"
                                    : "hover:bg-dark-accent/30"
                                }`}
                              >
                                <div className="w-5 h-5 rounded-full bg-dark-accent flex-shrink-0" />
                                <span className="text-dark-text text-sm min-w-0 overflow-hidden text-ellipsis whitespace-nowrap flex-1">{leftName}</span>
                                <PersonGenBadge personId={leftId} nodes={nodes} getPersonGenLabel={getPersonGenLabel} />
                              </button>
                            )}
                            {editingPersonId === rightId ? (
                              <div
                                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg min-w-0 ${
                                  isSelected(rightId) ? "bg-blue-500/20 ring-1 ring-blue-500/50" : "bg-dark-accent/30"
                                }`}
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
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleEntityClick(e, rightId)}
                                onDoubleClick={(e) => startEditingPerson(e, rightId, rightName)}
                                title={rightName}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left min-w-0 ${
                                  isSelected(rightId)
                                    ? "bg-blue-500/20 ring-1 ring-blue-500/50"
                                    : "hover:bg-dark-accent/30"
                                }`}
                              >
                                <div className="w-5 h-5 rounded-full bg-dark-accent flex-shrink-0" />
                                <span className="text-dark-text text-sm min-w-0 overflow-hidden text-ellipsis whitespace-nowrap flex-1">{rightName}</span>
                                <PersonGenBadge personId={rightId} nodes={nodes} getPersonGenLabel={getPersonGenLabel} />
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
                                          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg pl-6 min-w-0 ${
                                            isSelected(childId) ? "bg-blue-500/20 ring-1 ring-blue-500/50" : "bg-dark-accent/30"
                                          }`}
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
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={(e) => handleEntityClick(e, childId)}
                                          onDoubleClick={(e) => startEditingPerson(e, childId, name)}
                                          title={name}
                                          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left pl-6 min-w-0 ${
                                            isSelected(childId)
                                              ? "bg-blue-500/20 ring-1 ring-blue-500/50"
                                              : "hover:bg-dark-accent/30"
                                          }`}
                                        >
                                          <div className="w-5 h-5 rounded-full bg-dark-accent/70 flex-shrink-0" />
                                          <span className="text-dark-text text-sm min-w-0 overflow-hidden text-ellipsis whitespace-nowrap flex-1">{name}</span>
                                          <PersonGenBadge personId={childId} nodes={nodes} getPersonGenLabel={getPersonGenLabel} />
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

            {filteredUnlinkedPeople.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-dark-muted uppercase tracking-wide mb-2 px-1">
                  Unlinked
                </h3>
                <div className="space-y-1">
                  {filteredUnlinkedPeople.map((node) => {
                    const name = node.data.name || "New Person";
                    return (
                      <div key={node.id}>
                        {editingPersonId === node.id ? (
                          <div
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border min-w-0 ${
                              isSelected(node.id) ? "border-blue-500 bg-blue-500/20 ring-1 ring-blue-500/50" : "border-dark-accent/30 bg-dark-accent/30"
                            }`}
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
                            <PersonGenBadge personId={node.id} nodes={nodes} getPersonGenLabel={getPersonGenLabel} pill />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleEntityClick(e, node.id)}
                            onDoubleClick={(e) => startEditingPerson(e, node.id, name)}
                            title={name}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors text-left cursor-pointer min-w-0 ${
                              isSelected(node.id)
                                ? "border-blue-500 bg-blue-500/20 ring-1 ring-blue-500/50"
                                : "border-dark-accent/30 hover:bg-dark-accent/30"
                            }`}
                          >
                            <div className="w-6 h-6 rounded-full bg-dark-accent flex-shrink-0" />
                            <span className="text-dark-text text-sm flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{name}</span>
                            <PersonGenBadge personId={node.id} nodes={nodes} getPersonGenLabel={getPersonGenLabel} pill />
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

        <div className="p-3 border-t border-dark-accent/50 flex-shrink-0">
        <button
          type="button"
          onClick={handleDeleteClick}
          disabled={!canDelete}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent border-dark-accent/50 text-dark-muted hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/10"
          title={hasSelection ? "Delete selected entities" : "Select entities to delete"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
        </div>
      </div>

      {deleteConfirmOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
            <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 max-w-sm mx-4 shadow-lg">
              <p className="text-sm text-dark-text mb-3">{confirmMessage}</p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDeleteConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={handleConfirmDelete}>
                  Delete
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
