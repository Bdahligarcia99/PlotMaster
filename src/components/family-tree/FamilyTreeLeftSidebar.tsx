import { useMemo, useState } from "react";
import type { Node, Edge } from "reactflow";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import type { PersonNodeData, UnionNodeData } from "../../store/familyTreeStore";
import { formatGenerationAnchorLabel, isChildEdge } from "../../store/familyTreeStore";

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
  return (n?.data as PersonNodeData)?.name || "New Person";
}

interface FamilyTreeLeftSidebarProps {
  onSelectNode?: () => void;
}

export default function FamilyTreeLeftSidebar({ onSelectNode }: FamilyTreeLeftSidebarProps) {
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const edges = useFamilyTreeStore((s) => s.edges);
  const selectedNodeIds = useFamilyTreeStore((s) => s.selectedNodeIds);
  const setSelectedNodeIds = useFamilyTreeStore((s) => s.setSelectedNodeIds);
  const updateNodeName = useFamilyTreeStore((s) => s.updateNodeName);
  const [collapsedUnits, setCollapsedUnits] = useState<Set<string>>(new Set());
  const [lastEntityClickedId, setLastEntityClickedId] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

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

  const visibleEntityOrder = useMemo(() => {
    const order: string[] = [];
    for (const unit of familyUnits) {
      order.push(unit.unionId);
      if (!collapsedUnits.has(unit.unionId)) {
        order.push(unit.parents[0], unit.parents[1], ...unit.children);
      }
    }
    for (const p of unlinkedPeople) {
      order.push(p.id);
    }
    return order;
  }, [familyUnits, unlinkedPeople, collapsedUnits]);

  const generationAnchors = useFamilyTreeStore((s) => s.generationAnchors);
  const genLabelMode = useFamilyTreeStore((s) => s.genLabelMode);

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
    if (onSelectNode) onSelectNode();
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

  return (
    <div className="w-full min-w-0 flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden">
      <div className="p-4 border-b border-dark-accent/50">
        <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
          Entities
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
      <div className="flex-1 overflow-y-auto p-2">
        {familyUnits.length === 0 && unlinkedPeople.length === 0 ? (
          <p className="text-dark-muted text-sm py-4 text-center">No entities yet.</p>
        ) : (
          <div className="space-y-3">
            {familyUnits.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-dark-muted uppercase tracking-wide mb-2 px-1">
                  Family Units
                </h3>
                <div className="space-y-2">
                  {familyUnits.map((unit) => {
                    const [leftId, rightId] = unit.parents;
                    const leftName = getPersonName(nodes, leftId);
                    const rightName = getPersonName(nodes, rightId);
                    const isCollapsed = collapsedUnits.has(unit.unionId);

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
                                {getPersonGenLabel(leftId) && (
                                  <span className="text-dark-muted text-[10px] flex-shrink-0">{getPersonGenLabel(leftId)}</span>
                                )}
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
                                {getPersonGenLabel(leftId) && (
                                  <span className="text-dark-muted text-[10px] flex-shrink-0">
                                    {getPersonGenLabel(leftId)}
                                  </span>
                                )}
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
                                {getPersonGenLabel(rightId) && (
                                  <span className="text-dark-muted text-[10px] flex-shrink-0">{getPersonGenLabel(rightId)}</span>
                                )}
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
                                {getPersonGenLabel(rightId) && (
                                  <span className="text-dark-muted text-[10px] flex-shrink-0">
                                    {getPersonGenLabel(rightId)}
                                  </span>
                                )}
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
                                          {getPersonGenLabel(childId) && (
                                            <span className="text-dark-muted text-[10px] flex-shrink-0">{getPersonGenLabel(childId)}</span>
                                          )}
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
                                          {getPersonGenLabel(childId) && (
                                            <span className="text-dark-muted text-[10px] flex-shrink-0">
                                              {getPersonGenLabel(childId)}
                                            </span>
                                          )}
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

            {unlinkedPeople.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-dark-muted uppercase tracking-wide mb-2 px-1">
                  Unlinked
                </h3>
                <div className="space-y-1">
                  {unlinkedPeople.map((node) => {
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
                            {getPersonGenLabel(node.id) && (
                              <span className="text-dark-muted text-[10px] px-2 py-0.5 rounded-full bg-dark-accent/50 border border-dark-accent/50 flex-shrink-0">
                                {getPersonGenLabel(node.id)}
                              </span>
                            )}
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
                            {getPersonGenLabel(node.id) && (
                              <span className="text-dark-muted text-[10px] px-2 py-0.5 rounded-full bg-dark-accent/50 border border-dark-accent/50 flex-shrink-0">
                                {getPersonGenLabel(node.id)}
                              </span>
                            )}
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
    </div>
  );
}
