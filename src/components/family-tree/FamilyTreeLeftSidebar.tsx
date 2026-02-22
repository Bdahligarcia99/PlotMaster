import { useMemo } from "react";
import type { Node } from "reactflow";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import type { PersonNodeData } from "../../store/familyTreeStore";
import { computeGenerations, formatGeneration } from "../../store/familyTreeStore";

export default function FamilyTreeLeftSidebar() {
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const edges = useFamilyTreeStore((s) => s.edges);
  const setSelectedNodeIds = useFamilyTreeStore((s) => s.setSelectedNodeIds);

  const generationByPersonId = useMemo(
    () => computeGenerations(nodes, edges),
    [nodes, edges]
  );

  const personNodes = nodes
    .filter((n): n is Node<PersonNodeData> => n.data.kind === "person")
    .sort((a, b) => {
      const nameA = (a.data.name || "New Person").toLowerCase();
      const nameB = (b.data.name || "New Person").toLowerCase();
      return nameA.localeCompare(nameB);
    });

  return (
    <div className="w-[260px] flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden">
      <div className="p-4 border-b border-dark-accent/50">
        <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
          Entities
        </h2>
        <p className="text-dark-muted text-xs mt-1">Names in this tree</p>
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
        {personNodes.length === 0 ? (
          <p className="text-dark-muted text-sm py-4 text-center">No entities yet.</p>
        ) : (
          <div className="space-y-1">
            {personNodes.map((node) => {
              const name = node.data.name || "New Person";
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedNodeIds([node.id])}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-dark-accent/30 hover:bg-dark-accent/30 transition-colors text-left cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-full bg-dark-accent flex-shrink-0" />
                  <span className="text-dark-text text-sm flex-1 truncate">{name}</span>
                  <span className="text-dark-muted text-[10px] px-2 py-0.5 rounded-full bg-dark-accent/50 border border-dark-accent/50 flex-shrink-0">
                    {formatGeneration(generationByPersonId[node.id])}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
