import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "../ui/Button";
import NumberSlider from "../ui/NumberSlider";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import FamilyTreeExportDialog from "./FamilyTreeExportDialog";
import FamilyTreeReviewSuggestionsModal from "./FamilyTreeReviewSuggestionsModal";
import {
  formatGenerationAnchorLabel,
  getPersonDisplayName,
  getPersonNameParts,
  getUnionParentGap,
  getUnionChildrenAvgGap,
  getUnionVerticalGap,
  getUnionDirectChildren,
  PARTNER_DX,
  CHILD_DY,
  DEFAULT_CHILD_ROW_SPACING,
  type GenerationAnchor,
  type UnionNodeData,
} from "../../store/familyTreeStore";

export default function FamilyTreeToolbar() {
  const {
    nodes,
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
    nodeInfoSpacing,
    setNodeInfoSpacing,
    autosaveEnabled,
    setAutosaveEnabled,
    activeProjectId,
    clearTree,
    addPerson,
    createUnion,
    createBackwardUnion,
    addChild,
    addParent,
    linkPersonToUnion,
    setSelectedNodeIds,
    defaultUnionType,
    setDefaultUnionType,
    persistUnionSelectionOnChildCreate,
    setPersistUnionSelectionOnChildCreate,
    addGenerationAnchor,
    showGenerationAnchors,
    setShowGenerationAnchors,
    showGenInheritIndicator,
    setShowGenInheritIndicator,
    genAnchorBandOpacity,
    setGenAnchorBandOpacity,
    genAnchorLineOpacity,
    setGenAnchorLineOpacity,
    generationAnchors,
    genLabelMode,
    setGenLabelMode,
    marqueeToolActive,
    setMarqueeToolActive,
    showLegend,
    setShowLegend,
    sortUnion,
    setUnionArrangeSpacing,
    applyAverageParentSpacing,
    applyAverageChildSpacing,
    applyAverageVerticalSpacing,
    applyParentAlignment,
    nameRoleSuggestions,
    runNameRoleAnalysis,
    recomputeFamilies,
    updatePersonNameParts,
    updateUnionPartnerRole,
    flushSaveAndSave,
    reviewNodesModalOpen,
    setReviewNodesModalOpen,
  } = useFamilyTreeStore();

  const [message, setMessage] = useState<string | null>(null);
  const [childMenuOpen, setChildMenuOpen] = useState(false);
  const childContainerRef = useRef<HTMLDivElement>(null);
  const childDropdownRef = useRef<HTMLDivElement>(null);
  const [autosaveLabelOverride, setAutosaveLabelOverride] = useState<string | null>(null);
  const [genAnchorMenuOpen, setGenAnchorMenuOpen] = useState(false);
  const genAnchorContainerRef = useRef<HTMLDivElement>(null);
  const genAnchorDropdownRef = useRef<HTMLDivElement>(null);
  const [personMenuOpen, setPersonMenuOpen] = useState(false);
  const personContainerRef = useRef<HTMLDivElement>(null);
  const personDropdownRef = useRef<HTMLDivElement>(null);
  const [coordMenuOpen, setCoordMenuOpen] = useState(false);
  const coordContainerRef = useRef<HTMLDivElement>(null);
  const coordDropdownRef = useRef<HTMLDivElement>(null);
  const [unionMenuOpen, setUnionMenuOpen] = useState(false);
  const unionContainerRef = useRef<HTMLDivElement>(null);
  const unionDropdownRef = useRef<HTMLDivElement>(null);
  const [arrangeMenuOpen, setArrangeMenuOpen] = useState(false);
  const arrangeContainerRef = useRef<HTMLDivElement>(null);
  const arrangeDropdownRef = useRef<HTMLDivElement>(null);

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

  // Refresh suggestions when nodes/edges change so the indicator stays in sync
  const edges = useFamilyTreeStore((s) => s.edges);
  useEffect(() => {
    const t = setTimeout(() => runNameRoleAnalysis(), 300);
    return () => clearTimeout(t);
  }, [nodes, edges, runNameRoleAnalysis]);

  useEffect(() => {
    const t = setTimeout(() => recomputeFamilies(), 300);
    return () => clearTimeout(t);
  }, [nodes, edges, recomputeFamilies]);

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
    if (!genAnchorMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = genAnchorContainerRef.current?.contains(target);
      const inDropdown = genAnchorDropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) setGenAnchorMenuOpen(false);
    };
    const t = setTimeout(
      () => document.addEventListener("click", handleClickOutside, { once: true }),
      0
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [genAnchorMenuOpen]);

  useEffect(() => {
    if (!personMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = personContainerRef.current?.contains(target);
      const inDropdown = personDropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) setPersonMenuOpen(false);
    };
    const t = setTimeout(
      () => document.addEventListener("click", handleClickOutside, { once: true }),
      0
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [personMenuOpen]);

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

  useEffect(() => {
    if (!unionMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = unionContainerRef.current?.contains(target);
      const inDropdown = unionDropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) setUnionMenuOpen(false);
    };
    const t = setTimeout(
      () => document.addEventListener("click", handleClickOutside, { once: true }),
      0
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [unionMenuOpen]);

  useEffect(() => {
    if (!arrangeMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = arrangeContainerRef.current?.contains(target);
      const inDropdown = arrangeDropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) setArrangeMenuOpen(false);
    };
    const t = setTimeout(
      () => document.addEventListener("click", handleClickOutside, { once: true }),
      0
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [arrangeMenuOpen]);

  const handleAutosaveChange = (enabled: boolean) => {
    setAutosaveEnabled(enabled);
    setAutosaveLabelOverride(enabled ? "All changes saved" : "Autosave off");
  };

  const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));
  const selectedPersons = selectedNodes.filter((n) => (n.data as { kind?: string }).kind === "person");
  const selectedUnions = selectedNodes.filter((n) => (n.data as { kind?: string }).kind === "union");

  const canCreateForwardUnion = selectedNodeIds.length === 2 && selectedPersons.length === 2;
  const canCreateBackwardUnion =
    selectedNodeIds.length >= 1 &&
    selectedPersons.length >= 1 &&
    selectedPersons.length <= 2 &&
    selectedNodeIds.length === selectedPersons.length;
  const canCreateUnion =
    defaultUnionType === "forward" ? canCreateForwardUnion : canCreateBackwardUnion;

  const canLinkPerson =
    selectedNodeIds.length === 2 &&
    selectedUnions.length === 1 &&
    selectedPersons.length === 1;
  const linkUnion = canLinkPerson ? selectedUnions[0] : null;
  const linkPerson = canLinkPerson ? selectedPersons[0] : null;
  const canUnionAction = canCreateUnion || canLinkPerson;

  const canAddChild = selectedNodeIds.length === 1 && selectedUnions.length === 1;
  const canArrange = selectedNodeIds.length === 1 && selectedUnions.length === 1;
  const selectedUnion = selectedUnions[0];
  const selectedUnionData = selectedUnion?.data as UnionNodeData | undefined;
  const selectedUnionId = selectedUnion?.id;
  const directChildren =
    selectedUnionId != null ? getUnionDirectChildren(selectedUnionId, nodes, edges) : [];
  const hasBothPartners = selectedUnionId != null && getUnionParentGap(selectedUnionId, nodes) != null;
  const hasTwoOrMoreChildren = directChildren.length >= 2;
  const hasAnyChildren = directChildren.length >= 1;
  const arrangeSpacing = selectedUnionData?.arrangeSpacing;
  const parentSpacingValue =
    arrangeSpacing?.parentSpacing ??
    (selectedUnionId != null ? getUnionParentGap(selectedUnionId, nodes) : null) ??
    PARTNER_DX;
  const childSpacingValue =
    arrangeSpacing?.childSpacing ??
    (selectedUnionId != null ? getUnionChildrenAvgGap(selectedUnionId, nodes, edges) : null) ??
    DEFAULT_CHILD_ROW_SPACING;
  const verticalSpacingValue =
    arrangeSpacing?.verticalSpacing ??
    (selectedUnionId != null ? getUnionVerticalGap(selectedUnionId, nodes, edges) : null) ??
    CHILD_DY;
  const canAddParent =
    selectedNodeIds.length === 1 &&
    selectedUnions.length === 1 &&
    (selectedUnionData?.partnerIds?.filter((id): id is string => id != null).length ?? 0) < 2;

  function getCreateUnionTooltip(): string {
    if (canLinkPerson && linkPerson) {
      const name = getPersonDisplayName(linkPerson.data as import("../../store/familyTreeStore").PersonNodeData, linkPerson.id, nodes) || "person";
      return defaultUnionType === "forward"
        ? `Link ${name} as parent (choose mode in dropdown)`
        : `Link ${name} as child (choose mode in dropdown)`;
    }
    if (defaultUnionType === "forward") {
      if (canCreateForwardUnion) return "Create forward union (parents → children)";
      if (selectedNodeIds.length < 2) return "Select two people as parents.";
      return "Select exactly two people.";
    }
    if (canCreateBackwardUnion) return "Create backward union (children → parents)";
    if (selectedNodeIds.length === 0) return "Select 1 or 2 people as children.";
    return "Select 1 or 2 people.";
  }

  function getAddChildTooltip(): string {
    if (canAddChild) return "Add child to selected union";
    if (selectedNodeIds.length === 0) return "Select a union.";
    if (selectedNodeIds.length === 1) return "Select a union.";
    return "Select exactly one union.";
  }

  function getArrangeTooltip(): string {
    if (canArrange) return "Arrange selected union's partners and direct children";
    if (selectedNodeIds.length === 0) return "Select a union to arrange.";
    if (selectedNodeIds.length === 1) return "Select a union to arrange.";
    return "Select exactly one union to arrange.";
  }

  const handleCreateUnion = () => {
    if (canLinkPerson && linkUnion && linkPerson) {
      const err = linkPersonToUnion(linkUnion.id, linkPerson.id, defaultUnionType);
      if (err) {
        setMessage(err);
      } else {
        setMessage("Linked.");
        setSelectedNodeIds([linkUnion.id]);
      }
      return;
    }
    if (defaultUnionType === "forward") {
      if (canCreateForwardUnion) {
        const personIds = selectedPersons.map((n) => n.id) as [string, string];
        createUnion(personIds);
        setMessage(null);
      } else {
        setMessage("Select exactly 2 people for forward union.");
      }
    } else {
      if (canCreateBackwardUnion) {
        const childIds = selectedPersons.map((n) => n.id);
        createBackwardUnion(
          childIds.length === 1 ? [childIds[0]!] : [childIds[0]!, childIds[1]!]
        );
        setMessage(null);
      } else {
        setMessage("Select 1 or 2 people for backward union.");
      }
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

  const handleArrange = () => {
    if (!canArrange) {
      setMessage("Select a union to arrange.");
      return;
    }
    const ok = sortUnion(selectedUnion!.id);
    setMessage(ok ? null : "Nothing to arrange for this union.");
  };

  const handleApplySuggestions = (
    toApply: { s: import("../../store/familyTreeStore").NameRoleSuggestion; idx: number }[],
    resolvedValues: Map<number, string>
  ) => {
    const personNodes = nodes.filter((n) => (n.data as { kind?: string }).kind === "person");
    for (const { s, idx } of toApply) {
      if (s.field === "unionHealth" || s.field === "genConflict") continue;
      const resolved = resolvedValues.get(idx) ?? s.proposedValue;
      if (s.field === "firstName") {
        const node = personNodes.find((n) => n.id === s.nodeId);
        const parts = node ? getPersonNameParts(node.data as import("../../store/familyTreeStore").PersonNodeData) : { first: "", middle: "", last: "" };
        updatePersonNameParts(s.nodeId, {
          firstName: resolved,
          middleName: parts.middle,
          lastName: parts.last,
        });
      } else if (s.field === "role" && s.unionId && s.slot && (resolved === "father" || resolved === "mother")) {
        updateUnionPartnerRole(s.unionId, s.slot, resolved as import("../../store/familyTreeStore").ParentRole);
      }
    }
    runNameRoleAnalysis();
    flushSaveAndSave();
    setMessage(`Applied ${toApply.length} suggestion${toApply.length === 1 ? "" : "s"}.`);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-dark-surface border-b border-dark-accent/50">
      <div ref={personContainerRef} className="relative flex rounded-lg overflow-hidden">
        <Button
          variant="primary"
          size="sm"
          onClick={() => (canAddParent ? addParent(selectedUnion!.id) : addPerson())}
          className="rounded-none border-0 rounded-l-lg"
          title={canAddParent ? "Add parent to selected union" : undefined}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {canAddParent ? "Parent" : "Person"}
        </Button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setPersonMenuOpen((o) => !o);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="rounded-r-lg px-1.5 py-1.5 text-sm font-medium flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white transition-colors border-l border-blue-500/50 active:bg-blue-800"
          title="Person spawn options"
          aria-expanded={personMenuOpen}
          aria-haspopup="true"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {personMenuOpen &&
          createPortal(
            <div
              ref={personDropdownRef}
              className="fixed py-1 min-w-[200px] rounded-lg border border-dark-accent bg-dark-surface shadow-lg z-[9999]"
              style={{
                top: personContainerRef.current
                  ? personContainerRef.current.getBoundingClientRect().bottom + 4
                  : 0,
                left: personContainerRef.current
                  ? personContainerRef.current.getBoundingClientRect().left
                  : 0,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  addPerson();
                  setPersonMenuOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
              >
                Auto (no gen)
              </button>
              {generationAnchors.length > 0 && (
                <>
                  <hr className="my-1 border-dark-accent/50" />
                  {[...generationAnchors].sort((a, b) => a.index - b.index).map((anchor: GenerationAnchor) => {
                    const label = formatGenerationAnchorLabel(anchor, genLabelMode);
                    const displayLabel = anchor.customLabel ? `Gen ${label} — ${anchor.customLabel}` : `Gen ${label}`;
                    return (
                      <button
                        key={anchor.id}
                        type="button"
                        onClick={() => {
                          addPerson({ genAnchorId: anchor.id });
                          setPersonMenuOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
                      >
                        {displayLabel}
                      </button>
                    );
                  })}
                </>
              )}
            </div>,
            document.body
          )}
      </div>
      <div ref={unionContainerRef} className="relative flex rounded-lg border border-dark-accent/50 group/union">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCreateUnion}
          disabled={!canUnionAction}
          title={canUnionAction ? getCreateUnionTooltip() : undefined}
          className="rounded-none border-0 rounded-l-lg"
        >
          Union
        </Button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setUnionMenuOpen((o) => !o);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={!canUnionAction}
          className="px-1.5 rounded-r-lg border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-bg text-dark-text text-sm flex items-center justify-center disabled:opacity-50"
          title="Union type options"
          aria-expanded={unionMenuOpen}
          aria-haspopup="true"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!canUnionAction && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-dark-accent border border-dark-bg/50 text-dark-text text-xs rounded opacity-0 group-hover/union:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
            {getCreateUnionTooltip()}
          </div>
        )}
        {unionMenuOpen &&
          createPortal(
            <div
              ref={unionDropdownRef}
              className="fixed py-1 min-w-[180px] rounded-lg border border-dark-accent bg-dark-surface shadow-lg z-[9999]"
              style={{
                top: unionContainerRef.current
                  ? unionContainerRef.current.getBoundingClientRect().bottom + 4
                  : 0,
                left: unionContainerRef.current
                  ? unionContainerRef.current.getBoundingClientRect().left
                  : 0,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setDefaultUnionType("forward");
                  setUnionMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
              >
                <span className="w-4">{defaultUnionType === "forward" ? "✓" : ""}</span>
                Forward union
              </button>
              <button
                type="button"
                onClick={() => {
                  setDefaultUnionType("backward");
                  setUnionMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
              >
                <span className="w-4">{defaultUnionType === "backward" ? "✓" : ""}</span>
                Backward union
              </button>
            </div>,
            document.body
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
      <Button
        variant={showLegend ? "primary" : "secondary"}
        size="sm"
        onClick={() => setShowLegend(!showLegend)}
        title="Show/hide connection style legend"
      >
        Legend
      </Button>
      <div ref={genAnchorContainerRef} className="relative flex rounded-lg border border-dark-accent/50">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => addGenerationAnchor()}
          title="Add generation anchor band"
          className="rounded-none border-0 rounded-l-lg"
        >
          + Gen Anchor
        </Button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setGenAnchorMenuOpen((o) => !o);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="px-1.5 rounded-r-lg border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-bg text-dark-text text-sm flex items-center justify-center"
          title="Generation anchor options"
          aria-expanded={genAnchorMenuOpen}
          aria-haspopup="true"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {genAnchorMenuOpen &&
          createPortal(
            <div
              ref={genAnchorDropdownRef}
              className="fixed py-1 min-w-[220px] rounded-lg border border-dark-accent bg-dark-surface shadow-lg z-[9999]"
              style={{
                top: genAnchorContainerRef.current
                  ? genAnchorContainerRef.current.getBoundingClientRect().bottom + 4
                  : 0,
                left: genAnchorContainerRef.current
                  ? genAnchorContainerRef.current.getBoundingClientRect().left
                  : 0,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  addGenerationAnchor();
                  setGenAnchorMenuOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text font-medium"
              >
                Add Generation
              </button>
              <label className="flex items-center gap-2 px-3 py-2 text-sm text-dark-text cursor-pointer hover:bg-dark-accent/50">
                <input
                  type="checkbox"
                  checked={showGenerationAnchors}
                  onChange={(e) => setShowGenerationAnchors(e.target.checked)}
                  className="rounded border-dark-accent bg-dark-bg text-blue-500 focus:ring-blue-500/50"
                />
                <span>Show generation anchors</span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2 text-sm text-dark-text cursor-pointer hover:bg-dark-accent/50">
                <input
                  type="checkbox"
                  checked={showGenInheritIndicator}
                  onChange={(e) => setShowGenInheritIndicator(e.target.checked)}
                  className="rounded border-dark-accent bg-dark-bg text-blue-500 focus:ring-blue-500/50"
                />
                <span>Show inherit indicator</span>
              </label>
              <hr className="my-1 border-dark-accent/50" />
              <div className="px-3 py-2">
                <label className="block text-dark-muted text-xs mb-2">Band opacity</label>
                <NumberSlider
                  value={genAnchorBandOpacity}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(v) => setGenAnchorBandOpacity(v)}
                  className="!mb-0"
                />
              </div>
              <div className="px-3 py-2">
                <label className="block text-dark-muted text-xs mb-2">Line opacity</label>
                <NumberSlider
                  value={genAnchorLineOpacity}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(v) => setGenAnchorLineOpacity(v)}
                  className="!mb-0"
                />
              </div>
              <hr className="my-1 border-dark-accent/50" />
              <div className="px-3 py-1 text-[10px] font-medium text-dark-muted uppercase tracking-wide">
                Label Mode
              </div>
              {(["letters", "numbers", "both"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setGenLabelMode(opt);
                    setGenAnchorMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
                >
                  <span className="w-4">{genLabelMode === opt ? "●" : "○"}</span>
                  {opt === "letters" ? "Letters" : opt === "numbers" ? "Numbers" : "Both"}
                </button>
              ))}
            </div>,
            document.body
          )}
      </div>
      <div ref={arrangeContainerRef} className="relative flex rounded-lg border border-dark-accent/50 group/arrange">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleArrange}
          disabled={!canArrange}
          title={getArrangeTooltip()}
          className="rounded-none border-0 rounded-l-lg"
        >
          Arrange
        </Button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (canArrange) setArrangeMenuOpen((o) => !o);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={!canArrange}
          className="px-1.5 rounded-r-lg border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-bg text-dark-text text-sm flex items-center justify-center disabled:opacity-50"
          title="Arrange spacing options"
          aria-expanded={arrangeMenuOpen}
          aria-haspopup="true"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!canArrange && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-dark-accent border border-dark-bg/50 text-dark-text text-xs rounded opacity-0 group-hover/arrange:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
            {getArrangeTooltip()}
          </div>
        )}
        {arrangeMenuOpen && canArrange && selectedUnionId &&
          createPortal(
            <div
              ref={arrangeDropdownRef}
              className="fixed py-2 px-3 min-w-[260px] rounded-lg border border-dark-accent bg-dark-surface shadow-lg z-[9999]"
              style={{
                top: arrangeContainerRef.current
                  ? arrangeContainerRef.current.getBoundingClientRect().bottom + 4
                  : 0,
                left: arrangeContainerRef.current
                  ? arrangeContainerRef.current.getBoundingClientRect().left
                  : 0,
              }}
            >
              <div className="text-[10px] font-medium text-dark-muted uppercase tracking-wide mb-2">
                Horizontal spacing
              </div>
              <div className={hasBothPartners ? "" : "opacity-50 pointer-events-none"}>
                <button
                  type="button"
                  onClick={() => applyAverageParentSpacing(selectedUnionId)}
                  className="block text-left text-sm text-dark-text hover:text-blue-400 mb-1 underline-offset-2 hover:underline"
                  title="Apply averaged parent spacing to all nodes"
                  disabled={!hasBothPartners}
                >
                  Parents
                </button>
                <NumberSlider
                  value={parentSpacingValue}
                  min={40}
                  max={600}
                  step={8}
                  onChange={(v) => setUnionArrangeSpacing(selectedUnionId, { parentSpacing: v })}
                  className="mb-3 !mb-3"
                />
              </div>
              <div className={hasTwoOrMoreChildren ? "" : "opacity-50 pointer-events-none"}>
                <button
                  type="button"
                  onClick={() => applyAverageChildSpacing(selectedUnionId)}
                  className="block text-left text-sm text-dark-text hover:text-blue-400 mb-1 underline-offset-2 hover:underline"
                  title="Apply averaged children spacing to all nodes"
                  disabled={!hasTwoOrMoreChildren}
                >
                  Children
                </button>
                <NumberSlider
                  value={childSpacingValue}
                  min={40}
                  max={600}
                  step={8}
                  onChange={(v) => setUnionArrangeSpacing(selectedUnionId, { childSpacing: v })}
                  className="mb-3 !mb-3"
                />
              </div>
              <div className={`mb-3 ${hasAnyChildren ? "" : "opacity-50 pointer-events-none"}`}>
                <div className="text-xs text-dark-muted mb-1.5">Parent alignment</div>
                <div className="flex gap-1">
                  {(["left", "center", "right"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={!hasAnyChildren}
                      onClick={() => {
                        applyParentAlignment(selectedUnionId, opt);
                        setArrangeMenuOpen(false);
                      }}
                      className={`flex-1 px-2 py-1 text-xs rounded border capitalize ${
                        arrangeSpacing?.parentAlignment === opt
                          ? "border-blue-500 bg-blue-500/20 text-blue-300"
                          : "border-dark-accent text-dark-text hover:bg-dark-accent/50"
                      } disabled:opacity-50`}
                      title={`Align parents ${opt} relative to child row`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-dark-accent/50 pt-2 mt-1">
                <div className="text-[10px] font-medium text-dark-muted uppercase tracking-wide mb-2">
                  Vertical spacing
                </div>
                <div className={hasAnyChildren ? "" : "opacity-50 pointer-events-none"}>
                  <button
                    type="button"
                    onClick={() => applyAverageVerticalSpacing(selectedUnionId)}
                    className="block text-left text-sm text-dark-text hover:text-blue-400 mb-1 underline-offset-2 hover:underline"
                    title="Apply averaged vertical spacing to all nodes"
                    disabled={!hasAnyChildren}
                  >
                    Vertical
                  </button>
                  <NumberSlider
                    value={verticalSpacingValue}
                    min={40}
                    max={500}
                    step={8}
                    onChange={(v) => setUnionArrangeSpacing(selectedUnionId, { verticalSpacing: v })}
                    className="mb-0 !mb-0"
                  />
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setReviewNodesModalOpen(true)}
        title={
          nameRoleSuggestions.length > 0
            ? `${nameRoleSuggestions.length} suggestion(s) – click to review`
            : "Review nodes – analysis runs when you open"
        }
      >
        Review nodes{nameRoleSuggestions.length > 0 ? ` (${nameRoleSuggestions.length})` : ""}
      </Button>
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
      <span className="text-dark-muted text-xs">Tip: Shift+Click: 2 people = union; union + person = link.</span>
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
                  nodeInfoTopLeft && !nodeInfoCenter && !nodeInfoSize && !nodeInfoSpacing
                    ? "At least one must be enabled"
                    : undefined
                }
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-dark-accent/50 text-dark-text disabled:opacity-50"
                disabled={nodeInfoTopLeft && !nodeInfoCenter && !nodeInfoSize && !nodeInfoSpacing}
              >
                <span className="w-4">{nodeInfoTopLeft ? "✓" : ""}</span>
                Top-left (x,y)
              </button>
              <button
                type="button"
                onClick={() => setNodeInfoCenter(!nodeInfoCenter)}
                title={
                  nodeInfoCenter && !nodeInfoTopLeft && !nodeInfoSize && !nodeInfoSpacing
                    ? "At least one must be enabled"
                    : undefined
                }
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-dark-accent/50 text-dark-text disabled:opacity-50"
                disabled={nodeInfoCenter && !nodeInfoTopLeft && !nodeInfoSize && !nodeInfoSpacing}
              >
                <span className="w-4">{nodeInfoCenter ? "✓" : ""}</span>
                Center (cx,cy)
              </button>
              <button
                type="button"
                onClick={() => setNodeInfoSize(!nodeInfoSize)}
                title={
                  nodeInfoSize && !nodeInfoTopLeft && !nodeInfoCenter && !nodeInfoSpacing
                    ? "At least one must be enabled"
                    : undefined
                }
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-dark-accent/50 text-dark-text disabled:opacity-50"
                disabled={nodeInfoSize && !nodeInfoTopLeft && !nodeInfoCenter && !nodeInfoSpacing}
              >
                <span className="w-4">{nodeInfoSize ? "✓" : ""}</span>
                Size (w,h)
              </button>
              <button
                type="button"
                onClick={() => setNodeInfoSpacing(!nodeInfoSpacing)}
                title={
                  nodeInfoSpacing && !nodeInfoTopLeft && !nodeInfoCenter && !nodeInfoSize
                    ? "At least one must be enabled"
                    : undefined
                }
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-dark-accent/50 text-dark-text disabled:opacity-50"
                disabled={nodeInfoSpacing && !nodeInfoTopLeft && !nodeInfoCenter && !nodeInfoSize}
              >
                <span className="w-4">{nodeInfoSpacing ? "✓" : ""}</span>
                Spacing (2 selected)
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
      <FamilyTreeExportDialog
        onExportComplete={() => setMessage("Export coming soon")}
      />
      <FamilyTreeReviewSuggestionsModal
        isOpen={reviewNodesModalOpen}
        onClose={() => setReviewNodesModalOpen(false)}
        suggestions={nameRoleSuggestions}
        nodes={nodes}
        onApply={handleApplySuggestions}
        onOpen={runNameRoleAnalysis}
      />
    </div>
  );
}
