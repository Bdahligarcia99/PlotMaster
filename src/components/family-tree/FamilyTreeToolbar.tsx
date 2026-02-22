import { useState, useEffect } from "react";
import Button from "../ui/Button";
import { useFamilyTreeStore } from "../../store/familyTreeStore";

export default function FamilyTreeToolbar() {
  const {
    nodes,
    selectedNodeIds,
    snapToGrid,
    setSnapToGrid,
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
    </div>
  );
}
