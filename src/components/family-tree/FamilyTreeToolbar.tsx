import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "../ui/Button";
import NumberSlider from "../ui/NumberSlider";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import FamilyTreeExportDialog from "./FamilyTreeExportDialog";
import FamilyTreeReviewSuggestionsModal from "./FamilyTreeReviewSuggestionsModal";
import FamilyEradicationWarningModal from "./FamilyEradicationWarningModal";
import FullUnionAdvancedDialog from "./FullUnionAdvancedDialog";
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
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const selectedNodeIds = useFamilyTreeStore((s) => s.selectedNodeIds);
  const snapToGrid = useFamilyTreeStore((s) => s.snapToGrid);
  const setSnapToGrid = useFamilyTreeStore((s) => s.setSnapToGrid);
  const showNodeInfoEnabled = useFamilyTreeStore((s) => s.showNodeInfoEnabled);
  const setShowNodeInfoEnabled = useFamilyTreeStore((s) => s.setShowNodeInfoEnabled);
  const nodeInfoTopLeft = useFamilyTreeStore((s) => s.nodeInfoTopLeft);
  const nodeInfoCenter = useFamilyTreeStore((s) => s.nodeInfoCenter);
  const nodeInfoSize = useFamilyTreeStore((s) => s.nodeInfoSize);
  const setNodeInfoTopLeft = useFamilyTreeStore((s) => s.setNodeInfoTopLeft);
  const setNodeInfoCenter = useFamilyTreeStore((s) => s.setNodeInfoCenter);
  const setNodeInfoSize = useFamilyTreeStore((s) => s.setNodeInfoSize);
  const nodeInfoSpacing = useFamilyTreeStore((s) => s.nodeInfoSpacing);
  const setNodeInfoSpacing = useFamilyTreeStore((s) => s.setNodeInfoSpacing);
  const autosaveEnabled = useFamilyTreeStore((s) => s.autosaveEnabled);
  const setAutosaveEnabled = useFamilyTreeStore((s) => s.setAutosaveEnabled);
  const activeProjectId = useFamilyTreeStore((s) => s.activeProjectId);
  const activeFamilyTabId = useFamilyTreeStore((s) => s.activeFamilyTabId);
  const families = useFamilyTreeStore((s) => s.families);
  const requestClearFamily = useFamilyTreeStore((s) => s.requestClearFamily);
  const pendingClearFamilyConfirm = useFamilyTreeStore((s) => s.pendingClearFamilyConfirm);
  const confirmClearFamily = useFamilyTreeStore((s) => s.confirmClearFamily);
  const cancelClearFamily = useFamilyTreeStore((s) => s.cancelClearFamily);
  const addPerson = useFamilyTreeStore((s) => s.addPerson);
  const createUnion = useFamilyTreeStore((s) => s.createUnion);
  const createBackwardUnion = useFamilyTreeStore((s) => s.createBackwardUnion);
  const createFullUnion = useFamilyTreeStore((s) => s.createFullUnion);
  const addChild = useFamilyTreeStore((s) => s.addChild);
  const addParent = useFamilyTreeStore((s) => s.addParent);
  const linkPersonToUnion = useFamilyTreeStore((s) => s.linkPersonToUnion);
  const setSelectedNodeIds = useFamilyTreeStore((s) => s.setSelectedNodeIds);
  const defaultUnionType = useFamilyTreeStore((s) => s.defaultUnionType);
  const setDefaultUnionType = useFamilyTreeStore((s) => s.setDefaultUnionType);
  const fullUnionSettings = useFamilyTreeStore((s) => s.fullUnionSettings);
  const setFullUnionSettings = useFamilyTreeStore((s) => s.setFullUnionSettings);
  const persistUnionSelectionOnChildCreate = useFamilyTreeStore((s) => s.persistUnionSelectionOnChildCreate);
  const setPersistUnionSelectionOnChildCreate = useFamilyTreeStore((s) => s.setPersistUnionSelectionOnChildCreate);
  const addGenerationAnchor = useFamilyTreeStore((s) => s.addGenerationAnchor);
  const showGenerationAnchors = useFamilyTreeStore((s) => s.showGenerationAnchors);
  const setShowGenerationAnchors = useFamilyTreeStore((s) => s.setShowGenerationAnchors);
  const showGenInheritIndicator = useFamilyTreeStore((s) => s.showGenInheritIndicator);
  const setShowGenInheritIndicator = useFamilyTreeStore((s) => s.setShowGenInheritIndicator);
  const genAnchorBandOpacity = useFamilyTreeStore((s) => s.genAnchorBandOpacity);
  const setGenAnchorBandOpacity = useFamilyTreeStore((s) => s.setGenAnchorBandOpacity);
  const genAnchorLineOpacity = useFamilyTreeStore((s) => s.genAnchorLineOpacity);
  const setGenAnchorLineOpacity = useFamilyTreeStore((s) => s.setGenAnchorLineOpacity);
  const generationAnchors = useFamilyTreeStore((s) => s.generationAnchors);
  const genLabelMode = useFamilyTreeStore((s) => s.genLabelMode);
  const setGenLabelMode = useFamilyTreeStore((s) => s.setGenLabelMode);
  const marqueeToolActive = useFamilyTreeStore((s) => s.marqueeToolActive);
  const setMarqueeToolActive = useFamilyTreeStore((s) => s.setMarqueeToolActive);
  const branchToolActive = useFamilyTreeStore((s) => s.branchToolActive);
  const setBranchToolActive = useFamilyTreeStore((s) => s.setBranchToolActive);
  const showLegend = useFamilyTreeStore((s) => s.showLegend);
  const setShowLegend = useFamilyTreeStore((s) => s.setShowLegend);
  const legendMode = useFamilyTreeStore((s) => s.legendMode);
  const setLegendMode = useFamilyTreeStore((s) => s.setLegendMode);
  const sortUnion = useFamilyTreeStore((s) => s.sortUnion);
  const setUnionArrangeSpacing = useFamilyTreeStore((s) => s.setUnionArrangeSpacing);
  const applyAverageParentSpacing = useFamilyTreeStore((s) => s.applyAverageParentSpacing);
  const applyAverageChildSpacing = useFamilyTreeStore((s) => s.applyAverageChildSpacing);
  const applyAverageVerticalSpacing = useFamilyTreeStore((s) => s.applyAverageVerticalSpacing);
  const applyParentAlignment = useFamilyTreeStore((s) => s.applyParentAlignment);
  const nameRoleSuggestions = useFamilyTreeStore((s) => s.nameRoleSuggestions);
  const runNameRoleAnalysis = useFamilyTreeStore((s) => s.runNameRoleAnalysis);
  const recomputeFamilies = useFamilyTreeStore((s) => s.recomputeFamilies);
  const updatePersonNameParts = useFamilyTreeStore((s) => s.updatePersonNameParts);
  const updateUnionPartnerRole = useFamilyTreeStore((s) => s.updateUnionPartnerRole);
  const flushSaveAndSave = useFamilyTreeStore((s) => s.flushSaveAndSave);
  const reviewNodesModalOpen = useFamilyTreeStore((s) => s.reviewNodesModalOpen);
  const setReviewNodesModalOpen = useFamilyTreeStore((s) => s.setReviewNodesModalOpen);

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
  const [legendMenuOpen, setLegendMenuOpen] = useState(false);
  const legendContainerRef = useRef<HTMLDivElement>(null);
  const legendDropdownRef = useRef<HTMLDivElement>(null);
  const [unionMenuOpen, setUnionMenuOpen] = useState(false);
  const [fullUnionAdvancedOpen, setFullUnionAdvancedOpen] = useState(false);
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
    if (!legendMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = legendContainerRef.current?.contains(target);
      const inDropdown = legendDropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) setLegendMenuOpen(false);
    };
    const t = setTimeout(
      () => document.addEventListener("click", handleClickOutside, { once: true }),
      0
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [legendMenuOpen]);

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
  const isFullMode = defaultUnionType === "full";
  const canCreateUnion = isFullMode
    ? true
    : defaultUnionType === "forward"
      ? canCreateForwardUnion
      : canCreateBackwardUnion;

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
    selectedNodeIds.length === 1 && selectedUnions.length === 1;

  function getFullUnionTooltip(): string {
    const parts: string[] = [];
    if (selectedPersons.length === 2) {
      parts.push("2 parents");
    } else if (selectedPersons.length === 1) {
      parts.push("1 parent");
      if (fullUnionSettings.includeFather && fullUnionSettings.includeMother) {
        parts.push("+ partner");
      } else if (fullUnionSettings.includeFather || fullUnionSettings.includeMother) {
        parts.push(`+ ${fullUnionSettings.includeFather ? "father" : "mother"}`);
      }
    } else {
      if (fullUnionSettings.includeFather) parts.push("father");
      if (fullUnionSettings.includeMother) parts.push("mother");
      if (parts.length === 0) parts.push("no parents");
    }
    if (fullUnionSettings.includeChildren && fullUnionSettings.childCount > 0) {
      parts.push(
        `${fullUnionSettings.childCount} ${fullUnionSettings.childCount === 1 ? "child" : "children"}`
      );
    }
    return `Create full union (${parts.join(" + ")})`;
  }

  function getCreateUnionTooltip(): string {
    if (isFullMode) {
      return getFullUnionTooltip();
    }
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
    if (isFullMode) {
      const seedPersonIds = selectedPersons.map((n) => n.id);
      createFullUnion({ seedPersonIds });
      setMessage(null);
      return;
    }
    if (canLinkPerson && linkUnion && linkPerson) {
      const linkMode = defaultUnionType === "backward" ? "backward" : "forward";
      const err = linkPersonToUnion(linkUnion.id, linkPerson.id, linkMode);
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
      } else if (s.field === "role" && s.unionId && s.slot && resolved) {
        updateUnionPartnerRole(s.unionId, s.slot, resolved);
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
          +Union
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
          className="px-1.5 rounded-r-lg border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-bg text-dark-text text-sm flex items-center justify-center"
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
              className="fixed py-1 min-w-[220px] rounded-lg border border-dark-accent bg-dark-surface shadow-lg z-[9999]"
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
              <button
                type="button"
                onClick={() => {
                  setDefaultUnionType("full");
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
              >
                <span className="w-4">{defaultUnionType === "full" ? "✓" : ""}</span>
                Full union
              </button>
              {defaultUnionType === "full" && (
                <div className="border-t border-dark-accent/50 pl-4 pr-3 py-2 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-dark-text cursor-pointer hover:bg-dark-accent/50 rounded px-1 -mx-1">
                    <input
                      type="checkbox"
                      checked={fullUnionSettings.includeFather}
                      onChange={(e) =>
                        setFullUnionSettings({ includeFather: e.target.checked })
                      }
                      className="themed-checkbox"
                    />
                    <span>Father</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-dark-text cursor-pointer hover:bg-dark-accent/50 rounded px-1 -mx-1">
                    <input
                      type="checkbox"
                      checked={fullUnionSettings.includeMother}
                      onChange={(e) =>
                        setFullUnionSettings({ includeMother: e.target.checked })
                      }
                      className="themed-checkbox"
                    />
                    <span>Mother</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-dark-text cursor-pointer hover:bg-dark-accent/50 rounded px-1 -mx-1">
                    <input
                      type="checkbox"
                      checked={fullUnionSettings.includeChildren}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFullUnionSettings({
                          includeChildren: checked,
                          ...(checked && fullUnionSettings.childCount === 0
                            ? { childCount: 1 }
                            : {}),
                        });
                      }}
                      className="themed-checkbox"
                    />
                    <span>Children</span>
                  </label>
                  <div className="flex items-center gap-1 pl-1">
                    <button
                      type="button"
                      disabled={!fullUnionSettings.includeChildren}
                      onClick={() =>
                        setFullUnionSettings({
                          childCount: fullUnionSettings.childCount - 1,
                        })
                      }
                      className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/50 text-sm font-medium disabled:opacity-40 disabled:pointer-events-none"
                      title="Fewer children"
                    >
                      −
                    </button>
                    <span className="text-dark-text text-sm min-w-[1.25rem] text-center tabular-nums">
                      {fullUnionSettings.childCount}
                    </span>
                    <button
                      type="button"
                      disabled={!fullUnionSettings.includeChildren}
                      onClick={() =>
                        setFullUnionSettings({
                          childCount: fullUnionSettings.childCount + 1,
                        })
                      }
                      className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/50 text-sm font-medium disabled:opacity-40 disabled:pointer-events-none"
                      title="More children"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUnionMenuOpen(false);
                      setFullUnionAdvancedOpen(true);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-dark-accent/50 hover:text-blue-300"
                  >
                    Advanced options…
                  </button>
                </div>
              )}
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
                  className="themed-checkbox"
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
        variant={branchToolActive ? "primary" : "secondary"}
        size="sm"
        onClick={() => setBranchToolActive(!branchToolActive)}
        title="Branch tool — hide or extract descendant subtrees from a person"
      >
        Branch
      </Button>
      <div ref={legendContainerRef} className="relative flex rounded-lg border border-dark-accent/50">
        <Button
          variant={showLegend ? "primary" : "secondary"}
          size="sm"
          onClick={() => setShowLegend(!showLegend)}
          title="Show/hide connection style legend"
          className="rounded-none border-0 rounded-l-lg"
        >
          Legend
        </Button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setLegendMenuOpen((o) => !o);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="px-1.5 rounded-r-lg border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-bg text-dark-text text-sm flex items-center justify-center"
          title="Legend display options"
          aria-expanded={legendMenuOpen}
          aria-haspopup="true"
        >
          ▾
        </button>
        {legendMenuOpen && (
          <div
            ref={legendDropdownRef}
            className="absolute top-full left-0 mt-1 z-50 min-w-[200px] bg-dark-surface border border-dark-accent rounded-lg shadow-lg p-3 space-y-2"
          >
            <label className="flex items-center gap-2 text-sm text-dark-text cursor-pointer">
              <input
                type="radio"
                name="legend-mode"
                checked={legendMode === "tooltips"}
                onChange={() => setLegendMode("tooltips")}
                className="themed-radio"
              />
              Tool tips only
            </label>
            <label className="flex items-center gap-2 text-sm text-dark-text cursor-pointer">
              <input
                type="radio"
                name="legend-mode"
                checked={legendMode === "tooltipsAndIcons"}
                onChange={() => setLegendMode("tooltipsAndIcons")}
                className="themed-radio"
              />
              Tool tips and icons
            </label>
          </div>
        )}
      </div>
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
                  className="themed-checkbox"
                />
                <span>Show generation anchors</span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2 text-sm text-dark-text cursor-pointer hover:bg-dark-accent/50">
                <input
                  type="checkbox"
                  checked={showGenInheritIndicator}
                  onChange={(e) => setShowGenInheritIndicator(e.target.checked)}
                  className="themed-checkbox"
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
        onClick={() => activeFamilyTabId && requestClearFamily(activeFamilyTabId)}
        disabled={!activeProjectId || activeFamilyTabId == null}
        title={
          !activeProjectId
            ? "No project loaded"
            : activeFamilyTabId == null
              ? "Select a family tab to clear its nodes"
              : "Clear all nodes in the active family tab"
        }
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
          className="themed-checkbox"
        />
        Snap to Grid
      </label>
      <div ref={coordContainerRef} className="relative flex rounded border border-dark-accent/50">
        <label className="flex items-center gap-2 text-dark-muted text-sm cursor-pointer px-2 py-1.5 rounded-l">
          <input
            type="checkbox"
            checked={showNodeInfoEnabled}
            onChange={(e) => setShowNodeInfoEnabled(e.target.checked)}
            className="themed-checkbox"
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
          className="themed-checkbox"
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
      <FamilyEradicationWarningModal
        isOpen={pendingClearFamilyConfirm != null}
        familyName={
          pendingClearFamilyConfirm
            ? families.find((f) => f.id === pendingClearFamilyConfirm)?.name || "this family"
            : ""
        }
        onConfirm={confirmClearFamily}
        onClose={cancelClearFamily}
      />
      <FullUnionAdvancedDialog
        isOpen={fullUnionAdvancedOpen}
        onClose={() => setFullUnionAdvancedOpen(false)}
      />
    </div>
  );
}
