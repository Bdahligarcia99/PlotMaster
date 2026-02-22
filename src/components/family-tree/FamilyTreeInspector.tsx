import { useMemo } from "react";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import type { PersonNodeData } from "../../store/familyTreeStore";
import { computeGenerations, formatGeneration } from "../../store/familyTreeStore";
import Input from "../ui/Input";

export default function FamilyTreeInspector() {
  const { nodes, edges, primarySelectedNodeId, updateNodeName, updateNodeNotes } =
    useFamilyTreeStore();
  const generationByPersonId = useMemo(
    () => computeGenerations(nodes, edges),
    [nodes, edges]
  );

  const selectedNode = primarySelectedNodeId
    ? nodes.find((n) => n.id === primarySelectedNodeId)
    : null;

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

  const data = selectedNode.data;

  return (
    <div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto">
      <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide mb-3">
        Inspector
      </h3>
      <p className="text-dark-muted text-xs mb-3 font-mono">{selectedNode.id}</p>

      {data.kind === "person" ? (
        <>
          <div className="mb-4">
            <span className="text-dark-muted text-sm">Generation: </span>
            <span className="text-dark-text text-sm">
              {formatGeneration(generationByPersonId[selectedNode.id])}
            </span>
          </div>
          <Input
            label="Name"
            value={data.name}
            onChange={(e) => updateNodeName(selectedNode.id, e.target.value)}
            onBlur={(e) => {
              const trimmed = e.target.value.trim();
              if (trimmed !== e.target.value) {
                updateNodeName(selectedNode.id, trimmed);
              }
            }}
          />
          <div className="mb-4">
            <label className="block text-dark-muted text-sm mb-2">Notes</label>
            <textarea
              value={data.notes}
              onChange={(e) => updateNodeNotes(selectedNode.id, e.target.value)}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm resize-y min-h-[80px] focus:outline-none focus:border-blue-500"
              placeholder="Notes..."
            />
          </div>
        </>
      ) : (
        <>
          <div className="mb-4">
            <label className="block text-dark-muted text-sm mb-2">Partners</label>
            <p className="text-dark-text text-sm">
              {data.partnerIds
                .map((pid) => {
                  const partner = nodes.find((n) => n.id === pid && n.type === "person");
                  return (partner?.data as PersonNodeData | undefined)?.name ?? pid;
                })
                .join(", ")}
            </p>
          </div>
          <div className="mb-4">
            <label className="block text-dark-muted text-sm mb-2">Notes</label>
            <textarea
              value={data.notes}
              onChange={(e) => updateNodeNotes(selectedNode.id, e.target.value)}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm resize-y min-h-[80px] focus:outline-none focus:border-blue-500"
              placeholder="Notes..."
            />
          </div>
        </>
      )}
    </div>
  );
}
