import { useState, useEffect } from "react";
import Button from "../ui/Button";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import { snapPosition } from "../../store/familyTreeStore";

export default function FamilyTreeToolbar() {
  const {
    nodes,
    edges,
    selectedNodeIds,
    snapToGrid,
    setSnapToGrid,
    showCoordinates,
    setShowCoordinates,
    setNodes,
    addPerson,
    createUnion,
    addChild,
  } = useFamilyTreeStore();

  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

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
    const unionNodes = nodes.filter((n) => (n.data as { kind?: string }).kind === "union");

    // REQUIRED: Target union selection (unambiguous)
    let targetUnion: (typeof unionNodes)[0] | null = null;
    if (unionNodes.length === 1) {
      targetUnion = unionNodes[0];
    } else if (unionNodes.length > 1) {
      const sel = selectedNodes.find((n) => (n.data as { kind?: string }).kind === "union");
      if (sel) {
        targetUnion = sel;
      } else {
        setMessage("Select a union to sort.");
        return;
      }
    } else {
      setMessage("No union to sort.");
      return;
    }

    setMessage(null);

    const parentIds = (targetUnion.data as { partnerIds: [string, string] }).partnerIds;
    if (!parentIds || parentIds.length !== 2) {
      setMessage("Invalid union: partnerIds required.");
      return;
    }

    const parents = parentIds
      .map((id) => nodes.find((n) => n.id === id && (n.data as { kind?: string }).kind === "person"))
      .filter((n): n is NonNullable<typeof n> => n != null);

    if (parents.length !== 2) {
      setMessage("Both partners must exist as Person nodes.");
      return;
    }

    const anchorParent = parents[0].position.x <= parents[1].position.x ? parents[0] : parents[1];
    const otherParent = anchorParent.id === parents[0].id ? parents[1] : parents[0];

    const childEdgeTargets = edges
      .filter(
        (e) =>
          e.source === targetUnion!.id &&
          (e.data as { type?: string })?.type === "child"
      )
      .map((e) => e.target)
      .sort((a, b) => a.localeCompare(b));

    const childNodes = childEdgeTargets
      .map((id) => nodes.find((n) => n.id === id && (n.data as { kind?: string }).kind === "person"))
      .filter((n): n is NonNullable<typeof n> => n != null);

    const anchorX = anchorParent.position.x;
    const anchorY = anchorParent.position.y;
    const snap = (x: number, y: number) =>
      snapToGrid ? snapPosition(x, y, true) : { x, y };

    const updates: Array<{ id: string; position: { x: number; y: number } }> = [];

    updates.push({ id: otherParent.id, position: snap(anchorX + 224, anchorY) });
    updates.push({ id: targetUnion.id, position: snap(anchorX + 144, anchorY + 112) });

    if (childNodes[0]) {
      updates.push({ id: childNodes[0].id, position: snap(anchorX + 0, anchorY + 208) });
    }
    if (childNodes[1]) {
      updates.push({ id: childNodes[1].id, position: snap(anchorX + 336, anchorY + 240) });
    }

    if (process.env.NODE_ENV === "development") {
      const child1Pos = childNodes[0] ? snap(anchorX + 0, anchorY + 208) : null;
      const child2Pos = childNodes[1] ? snap(anchorX + 336, anchorY + 240) : null;
      console.log("[Sort] targetUnionId:", targetUnion.id);
      console.log("[Sort] parentIds:", parentIds);
      console.log("[Sort] parents:", parents.map((p) => ({ id: p.id, pos: p.position })));
      console.log(
        "[Sort] children (ordered):",
        childNodes.map((c, i) => ({ id: c.id, computedPos: i === 0 ? child1Pos : i === 1 ? child2Pos : null }))
      );
    }

    const updateMap = Object.fromEntries(updates.map((u) => [u.id, u.position]));
    setNodes((prev) =>
      prev.map((n) =>
        n.id in updateMap ? { ...n, position: updateMap[n.id] } : n
      )
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
      <div className="relative group">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleAddChild}
          disabled={!canAddChild}
          title={canAddChild ? getAddChildTooltip() : undefined}
        >
          + Child
        </Button>
        {!canAddChild && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-dark-accent border border-dark-bg/50 text-dark-text text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
            {getAddChildTooltip()}
          </div>
        )}
      </div>
      {message && <span className="text-amber-400 text-sm">{message}</span>}
      <Button variant="secondary" size="sm" onClick={handleSort} title="Align 2 people (Sort v0)">
        Sort
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
      <label className="flex items-center gap-2 text-dark-muted text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={showCoordinates}
          onChange={(e) => setShowCoordinates(e.target.checked)}
          className="rounded"
        />
        Show Coordinates
      </label>
    </div>
  );
}
