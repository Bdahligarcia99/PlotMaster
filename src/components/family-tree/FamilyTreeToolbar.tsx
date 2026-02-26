import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "../ui/Button";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import {
  snapPosition,
  isChildEdge,
  hasParents,
  PARTNER_DX,
  UNION_DY,
  CHILD_DY,
  CHILD_MAX_GAP,
  CHILD_MIN_GAP,
  DEFAULT_PERSON_W,
  DEFAULT_UNION_W,
  type UnionNodeData,
} from "../../store/familyTreeStore";

export default function FamilyTreeToolbar() {
  const {
    nodes,
    edges,
    nodeSizesById,
    selectedNodeIds,
    snapToGrid,
    setSnapToGrid,
    showNodeInfoEnabled,
    setShowNodeInfoEnabled,
    nodeInfoTopLeft,
    nodeInfoCenter,
    nodeInfoSize,
    setNodeInfoTopLeft,
    setNodeInfoCenter,
    setNodeInfoSize,
    singleChildAlignment,
    setSingleChildAlignment,
    childrenRowAlignment3Plus,
    setChildrenRowAlignment3Plus,
    autosaveEnabled,
    setAutosaveEnabled,
    activeProjectId,
    clearTree,
    setNodes,
    addPerson,
    createUnion,
    addChild,
    persistUnionSelectionOnChildCreate,
    setPersistUnionSelectionOnChildCreate,
    marqueeToolActive,
    setMarqueeToolActive,
  } = useFamilyTreeStore();

  const [message, setMessage] = useState<string | null>(null);
  const [childMenuOpen, setChildMenuOpen] = useState(false);
  const childContainerRef = useRef<HTMLDivElement>(null);
  const childDropdownRef = useRef<HTMLDivElement>(null);
  const [autosaveLabelOverride, setAutosaveLabelOverride] = useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortContainerRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [coordMenuOpen, setCoordMenuOpen] = useState(false);
  const coordContainerRef = useRef<HTMLDivElement>(null);
  const coordDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  useEffect(() => {
    if (autosaveLabelOverride) {
      const t = setTimeout(() => setAutosaveLabelOverride(null), 2500);
      return () => clearTimeout(t);
    }
  }, [autosaveLabelOverride]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "m" || e.key === "M") {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        e.preventDefault();
        const store = useFamilyTreeStore.getState();
        store.setMarqueeToolActive(!store.marqueeToolActive);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = sortContainerRef.current?.contains(target);
      const inDropdown = sortDropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) {
        setSortMenuOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener("click", handleClickOutside, { once: true }), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [sortMenuOpen]);

  useEffect(() => {
    if (!coordMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = coordContainerRef.current?.contains(target);
      const inDropdown = coordDropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) setCoordMenuOpen(false);
    };
    const t = setTimeout(
      () => document.addEventListener("click", handleClickOutside, { once: true }),
      0
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [coordMenuOpen]);

  useEffect(() => {
    if (!childMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = childContainerRef.current?.contains(target);
      const inDropdown = childDropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) {
        setChildMenuOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener("click", handleClickOutside, { once: true }), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [childMenuOpen]);

  const handleAutosaveChange = (enabled: boolean) => {
    setAutosaveEnabled(enabled);
    setAutosaveLabelOverride(enabled ? "All changes saved" : "Autosave off");
  };

  const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));
  const selectedPersons = selectedNodes.filter((n) => (n.data as { kind?: string }).kind === "person");
  const selectedUnions = selectedNodes.filter((n) => (n.data as { kind?: string }).kind === "union");

  const canCreateUnion = selectedNodeIds.length === 2 && selectedPersons.length === 2;
  const canAddChild = selectedNodeIds.length === 1 && selectedUnions.length === 1;
  const selectedUnion = selectedUnions[0];

  function getCreateUnionTooltip(): string {
    if (canCreateUnion) return "Create union between 2 selected people";
    if (selectedNodeIds.length === 0 || selectedNodeIds.length === 1) return "Select two people.";
    return "Select exactly two people.";
  }

  function getAddChildTooltip(): string {
    if (canAddChild) return "Add child to selected union";
    if (selectedNodeIds.length === 0) return "Select a union.";
    if (selectedNodeIds.length === 1) return "Select a union.";
    return "Select exactly one union.";
  }

  const handleCreateUnion = () => {
    if (canCreateUnion) {
      const personIds = selectedPersons.map((n) => n.id) as [string, string];
      createUnion(personIds);
      setMessage(null);
    } else {
      setMessage("Select exactly 2 people.");
    }
  };

  const handleAddChild = () => {
    if (canAddChild) {
      addChild(selectedUnion!.id);
      setMessage(null);
    } else {
      setMessage("Select a union.");
    }
  };

  const handleSort = () => {
    const personNodes = nodes.filter((n) => (n.data as { kind?: string }).kind === "person");
    const unionNodes = nodes.filter((n) => (n.data as { kind?: string }).kind === "union");

    const snap = (x: number, y: number) =>
      snapToGrid ? snapPosition(x, y, true) : { x, y };

    const updateMap: Record<string, { x: number; y: number }> = {};

    // RULE 1: No-union pair alignment (exactly 2 persons, 0 unions)
    if (personNodes.length === 2 && unionNodes.length === 0) {
      const anchor = personNodes[0].position.x <= personNodes[1].position.x ? personNodes[0] : personNodes[1];
      const other = anchor.id === personNodes[0].id ? personNodes[1] : personNodes[0];
      updateMap[other.id] = snap(anchor.position.x + PARTNER_DX, anchor.position.y);
      setMessage(null);
      setNodes((prev) =>
        prev.map((n) => (n.id in updateMap ? { ...n, position: updateMap[n.id] } : n))
      );
      return;
    }

    const getEffectivePos = (nodeId: string) =>
      nodeId in updateMap ? updateMap[nodeId]! : nodes.find((n) => n.id === nodeId)?.position;

    const backfillMap: Record<string, { leftPartnerId: string; rightPartnerId: string }> = {};

    // RULE 2: Per-union family-unit alignment (canvas-wide, for every union)
    const sortedUnions = [...unionNodes].sort((a, b) => a.id.localeCompare(b.id));

    for (const union of sortedUnions) {
      const unionData = union.data as UnionNodeData;
      const partnerIds = unionData.partnerIds;
      if (!partnerIds || partnerIds.length !== 2) continue;

      let leftPartnerNode: (typeof nodes)[0] | null = null;
      let rightPartnerNode: (typeof nodes)[0] | null = null;

      if (unionData.leftPartnerId && unionData.rightPartnerId) {
        const left = nodes.find(
          (n) => n.id === unionData.leftPartnerId && (n.data as { kind?: string }).kind === "person"
        );
        const right = nodes.find(
          (n) => n.id === unionData.rightPartnerId && (n.data as { kind?: string }).kind === "person"
        );
        if (left && right) {
          leftPartnerNode = left;
          rightPartnerNode = right;
        }
      }

      if (!leftPartnerNode || !rightPartnerNode) {
        const parents = partnerIds
          .map((id) => nodes.find((n) => n.id === id && (n.data as { kind?: string }).kind === "person"))
          .filter((n): n is NonNullable<typeof n> => n != null);
        if (parents.length !== 2) continue;

        const pos0 = getEffectivePos(parents[0].id);
        const pos1 = getEffectivePos(parents[1].id);
        if (!pos0 || !pos1) continue;

        const [leftId, rightId] =
          pos0.x <= pos1.x ? [parents[0].id, parents[1].id] : [parents[1].id, parents[0].id];
        backfillMap[union.id] = { leftPartnerId: leftId, rightPartnerId: rightId };
        leftPartnerNode = parents.find((p) => p.id === leftId)!;
        rightPartnerNode = parents.find((p) => p.id === rightId)!;
      }

      const leftPos = getEffectivePos(leftPartnerNode.id);
      const rightPos = getEffectivePos(rightPartnerNode.id);
      if (!leftPos || !rightPos) continue;

      const lockedL = hasParents(edges, leftPartnerNode.id);
      const lockedR = hasParents(edges, rightPartnerNode.id);

      let leftPosFinal: { x: number; y: number };
      let rightPosFinal: { x: number; y: number };
      if (lockedL && lockedR) {
        leftPosFinal = leftPos;
        rightPosFinal = rightPos;
      } else if (lockedL && !lockedR) {
        leftPosFinal = leftPos;
        rightPosFinal = snap(leftPos.x + PARTNER_DX, leftPos.y);
      } else if (lockedR && !lockedL) {
        leftPosFinal = snap(rightPos.x - PARTNER_DX, rightPos.y);
        rightPosFinal = rightPos;
      } else {
        leftPosFinal = snap(leftPos.x, leftPos.y);
        rightPosFinal = snap(leftPos.x + PARTNER_DX, leftPos.y);
      }

      const baseY = leftPosFinal.y;
      const baseX = leftPosFinal.x;

      if (!lockedL) updateMap[leftPartnerNode.id] = leftPosFinal;
      if (!lockedR) updateMap[rightPartnerNode.id] = rightPosFinal;

      const wL = nodeSizesById[leftPartnerNode.id]?.width ?? DEFAULT_PERSON_W;
      const wR = nodeSizesById[rightPartnerNode.id]?.width ?? DEFAULT_PERSON_W;
      const wU = nodeSizesById[union.id]?.width ?? DEFAULT_UNION_W;

      const pLx = leftPosFinal.x;
      const pRx = rightPosFinal.x;
      const cL = pLx + wL / 2;
      const cR = pRx + wR / 2;
      const unionCenterX = (cL + cR) / 2;
      const unionX = unionCenterX - wU / 2;
      const unionY = baseY + UNION_DY;
      const unionPos = snap(unionX, unionY);
      updateMap[union.id] = unionPos;

      const childEdgeTargets = edges
        .filter((e) => e.source === union.id && isChildEdge(e))
        .map((e) => e.target)
        .sort((a, b) => a.localeCompare(b));

      const childNodes = childEdgeTargets
        .map((id) => nodes.find((n) => n.id === id && (n.data as { kind?: string }).kind === "person"))
        .filter((n): n is NonNullable<typeof n> => n != null);

      const baselineY = baseY + CHILD_DY;
      const n = childNodes.length;

      if (n >= 1) {
        const childWidths = childNodes.map(
          (c) => nodeSizesById[c.id]?.width ?? DEFAULT_PERSON_W
        );
        const pLx = leftPosFinal.x;
        const pRx = rightPosFinal.x;

        if (n === 1) {
          const childW = childWidths[0];
          const unionCenterX = unionPos.x + wU / 2;
          let childX: number;
          if (singleChildAlignment === "left") {
            childX = pLx;
          } else if (singleChildAlignment === "center") {
            childX = unionCenterX - childW / 2;
          } else {
            childX = pRx;
          }
          updateMap[childNodes[0].id] = snap(childX, baselineY);
        } else if (n === 2) {
          updateMap[childNodes[0].id] = snap(pLx, baselineY);
          updateMap[childNodes[1].id] = snap(pRx, baselineY);
        } else {
          const totalChildWidth = childWidths.reduce((a, b) => a + b, 0);
          const gap = Math.max(
            CHILD_MIN_GAP,
            Math.min(CHILD_MAX_GAP, CHILD_MAX_GAP / (n - 1))
          );
          const totalWidth = totalChildWidth + (n - 1) * gap;
          const unionCenterX = unionPos.x + wU / 2;
          // 3+ alignment: use union role IDs (leftPartnerId/rightPartnerId) only, never x-order
          const leftRoleId = unionData.leftPartnerId;
          const rightRoleId = unionData.rightPartnerId;
          const leftParentByRole = leftRoleId ? nodes.find((no) => no.id === leftRoleId) : null;
          const rightParentByRole = rightRoleId ? nodes.find((no) => no.id === rightRoleId) : null;
          const leftParentPos = leftParentByRole ? getEffectivePos(leftParentByRole.id) : null;
          const rightParentPos = rightParentByRole ? getEffectivePos(rightParentByRole.id) : null;

          let rowStartX: number;
          const parentsMidX =
            leftParentPos && rightParentPos
              ? (leftParentPos.x + rightParentPos.x) / 2
              : unionCenterX;
          if (childrenRowAlignment3Plus === "left" && rightParentPos) {
            // Left: row ends at right parent's left edge (row is left of right parent)
            rowStartX = rightParentPos.x - totalWidth;
          } else if (childrenRowAlignment3Plus === "right" && leftParentPos && rightParentPos) {
            // Right: row starts at midpoint between parents, extends rightward
            rowStartX = parentsMidX;
          } else {
            rowStartX = unionCenterX - totalWidth / 2;
          }

          let currentX = rowStartX;
          for (let i = 0; i < childNodes.length; i++) {
            updateMap[childNodes[i].id] = snap(currentX, baselineY);
            currentX += childWidths[i] + gap;
          }

          if (import.meta.env.DEV && leftParentPos && rightParentPos) {
            const lastChildRight = rowStartX + totalWidth;
            if (childrenRowAlignment3Plus === "left") {
              console.assert(Math.abs(lastChildRight - rightParentPos.x) < 2, "[Sort] Left mode: row right edge should be near rightParent.x");
            } else if (childrenRowAlignment3Plus === "right") {
              console.assert(Math.abs(rowStartX - parentsMidX) < 2, "[Sort] Right mode: row left edge should be near parents midpoint");
            }
          }
        }
      }

      if (import.meta.env.DEV) {
        console.log("[Sort]", {
          unionId: union.id,
          leftPartnerId: leftPartnerNode.id,
          rightPartnerId: rightPartnerNode.id,
          baseX,
          baseY,
          unionPos,
        });
      }
    }

    if (Object.keys(updateMap).length === 0 && unionNodes.length > 0) {
      setMessage("No valid unions to sort.");
      return;
    }

    setMessage(null);
    setNodes((prev) =>
      prev.map((n) => {
        const posUpdate = n.id in updateMap ? updateMap[n.id] : undefined;
        const dataUpdate =
          n.type === "union" && n.id in backfillMap ? backfillMap[n.id] : undefined;
        if (posUpdate || dataUpdate) {
          return {
            ...n,
            ...(posUpdate && { position: posUpdate }),
            ...(dataUpdate && {
              data: { ...(n.data as UnionNodeData), ...dataUpdate },
            }),
          };
        }
        return n;
      })
    );
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-dark-surface border-b border-dark-accent/50">
      <Button variant="primary" size="sm" onClick={() => addPerson()}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        + Person
      </Button>
      <div className="relative group">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCreateUnion}
          disabled={!canCreateUnion}
          title={canCreateUnion ? getCreateUnionTooltip() : undefined}
        >
          Create Union
        </Button>
        {!canCreateUnion && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-dark-accent border border-dark-bg/50 text-dark-text text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
            {getCreateUnionTooltip()}
          </div>
        )}
      </div>
      <div ref={childContainerRef} className="relative flex rounded-lg border border-dark-accent/50 group/child">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleAddChild}
          disabled={!canAddChild}
          title={canAddChild ? getAddChildTooltip() : undefined}
          className="rounded-none border-0 rounded-l-lg"
        >
          + Child
        </Button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setChildMenuOpen((o) => !o);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={!canAddChild}
          className="px-1.5 rounded-r-lg border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-bg text-dark-text text-sm flex items-center justify-center disabled:opacity-50"
          title="Child options"
          aria-expanded={childMenuOpen}
          aria-haspopup="true"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {childMenuOpen &&
          createPortal(
            <div
              ref={childDropdownRef}
              className="fixed py-1 min-w-[200px] rounded-lg border border-dark-accent bg-dark-surface shadow-lg z-[9999]"
              style={{
                top: childContainerRef.current
                  ? childContainerRef.current.getBoundingClientRect().bottom + 4
                  : 0,
                left: childContainerRef.current
                  ? childContainerRef.current.getBoundingClientRect().left
                  : 0,
              }}
            >
              <label className="flex items-center gap-2 px-3 py-2 text-sm text-dark-text cursor-pointer hover:bg-dark-accent/50">
                <input
                  type="checkbox"
                  checked={persistUnionSelectionOnChildCreate}
                  onChange={(e) => setPersistUnionSelectionOnChildCreate(e.target.checked)}
                  className="rounded border-dark-accent bg-dark-bg text-blue-500 focus:ring-blue-500/50"
                />
                <span>Persist union selection</span>
              </label>
            </div>,
            document.body
          )}
        {!canAddChild && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-dark-accent border border-dark-bg/50 text-dark-text text-xs rounded opacity-0 group-hover/child:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
            {getAddChildTooltip()}
          </div>
        )}
      </div>
      {message && <span className="text-amber-400 text-sm">{message}</span>}
      <Button
        variant={marqueeToolActive ? "primary" : "secondary"}
        size="sm"
        onClick={() => setMarqueeToolActive(!marqueeToolActive)}
        title="Marquee Select (M) - drag box to select multiple nodes"
      >
        Marquee Select
      </Button>
      <div ref={sortContainerRef} className="relative flex rounded-lg border border-dark-accent/50">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSort}
          title="Sort family units (v1)"
          className="rounded-none border-0 rounded-l-lg"
        >
          Sort
        </Button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSortMenuOpen((o) => !o);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="px-1.5 rounded-r-lg border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-bg text-dark-text text-sm flex items-center justify-center"
          title="Sort options"
          aria-expanded={sortMenuOpen}
          aria-haspopup="true"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {sortMenuOpen &&
          createPortal(
            <div
              ref={sortDropdownRef}
              className="fixed py-1 min-w-[180px] rounded-lg border border-dark-accent bg-dark-surface shadow-lg z-[9999]"
              style={{
                top: sortContainerRef.current
                  ? sortContainerRef.current.getBoundingClientRect().bottom + 4
                  : 0,
                left: sortContainerRef.current
                  ? sortContainerRef.current.getBoundingClientRect().left
                  : 0,
              }}
            >
              <div className="px-3 py-1.5 text-[10px] font-medium text-dark-muted uppercase tracking-wide">
                Single-child alignment
              </div>
              {(["left", "center", "right"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setSingleChildAlignment(opt);
                    setSortMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
                >
                  <span className="w-4">{singleChildAlignment === opt ? "✓" : ""}</span>
                  {opt === "left" ? "Left parent" : opt === "center" ? "Center" : "Right parent"}
                </button>
              ))}
              <div className="px-3 py-1.5 text-[10px] font-medium text-dark-muted uppercase tracking-wide mt-1">
                3+ children alignment
              </div>
              {(["left", "center", "right"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setChildrenRowAlignment3Plus(opt);
                    setSortMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
                >
                  <span className="w-4">{childrenRowAlignment3Plus === opt ? "✓" : ""}</span>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>,
            document.body
          )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => clearTree()}
        disabled={!activeProjectId}
        title={activeProjectId ? "Clear tree and storage" : "No project loaded"}
      >
        Clear
      </Button>
      <div className="flex-1" />
      <span className="text-dark-muted text-xs">Tip: Shift+Click to select 2 people.</span>
      <label className="flex items-center gap-2 text-dark-muted text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={snapToGrid}
          onChange={(e) => setSnapToGrid(e.target.checked)}
          className="rounded"
        />
        Snap to Grid
      </label>
      <div ref={coordContainerRef} className="relative flex rounded border border-dark-accent/50">
        <label className="flex items-center gap-2 text-dark-muted text-sm cursor-pointer px-2 py-1.5 rounded-l">
          <input
            type="checkbox"
            checked={showNodeInfoEnabled}
            onChange={(e) => setShowNodeInfoEnabled(e.target.checked)}
            className="rounded"
          />
          Show Node Info
        </label>
        <button
          type="button"
          onClick={() => setCoordMenuOpen((o) => !o)}
          className="px-1.5 rounded-r border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-bg text-dark-text text-sm flex items-center"
          title="Node info display options"
          aria-expanded={coordMenuOpen}
          aria-haspopup="true"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {coordMenuOpen &&
          createPortal(
            <div
              ref={coordDropdownRef}
              className="fixed py-1 min-w-[160px] rounded-lg border border-dark-accent bg-dark-surface shadow-lg z-[9999]"
              style={{
                top: coordContainerRef.current
                  ? coordContainerRef.current.getBoundingClientRect().bottom + 4
                  : 0,
                left: coordContainerRef.current
                  ? coordContainerRef.current.getBoundingClientRect().left
                  : 0,
              }}
            >
              <button
                type="button"
                onClick={() => setNodeInfoTopLeft(!nodeInfoTopLeft)}
                title={
                  nodeInfoTopLeft && !nodeInfoCenter && !nodeInfoSize
                    ? "At least one must be enabled"
                    : undefined
                }
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-dark-accent/50 text-dark-text disabled:opacity-50"
                disabled={nodeInfoTopLeft && !nodeInfoCenter && !nodeInfoSize}
              >
                <span className="w-4">{nodeInfoTopLeft ? "✓" : ""}</span>
                Top-left (x,y)
              </button>
              <button
                type="button"
                onClick={() => setNodeInfoCenter(!nodeInfoCenter)}
                title={
                  nodeInfoCenter && !nodeInfoTopLeft && !nodeInfoSize
                    ? "At least one must be enabled"
                    : undefined
                }
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-dark-accent/50 text-dark-text disabled:opacity-50"
                disabled={nodeInfoCenter && !nodeInfoTopLeft && !nodeInfoSize}
              >
                <span className="w-4">{nodeInfoCenter ? "✓" : ""}</span>
                Center (cx,cy)
              </button>
              <button
                type="button"
                onClick={() => setNodeInfoSize(!nodeInfoSize)}
                title={
                  nodeInfoSize && !nodeInfoTopLeft && !nodeInfoCenter
                    ? "At least one must be enabled"
                    : undefined
                }
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-dark-accent/50 text-dark-text disabled:opacity-50"
                disabled={nodeInfoSize && !nodeInfoTopLeft && !nodeInfoCenter}
              >
                <span className="w-4">{nodeInfoSize ? "✓" : ""}</span>
                Size (w,h)
              </button>
            </div>,
            document.body
          )}
      </div>
      <label
        className="flex items-center gap-2 text-dark-muted text-sm cursor-pointer"
        title="When on, changes are saved automatically."
      >
        <input
          type="checkbox"
          checked={autosaveEnabled}
          onChange={(e) => handleAutosaveChange(e.target.checked)}
          className="rounded"
        />
        {autosaveLabelOverride ?? "Autosave"}
      </label>
    </div>
  );
}
