import type { Edge } from "reactflow";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import type { PersonNodeData, UnionNodeData } from "../../store/familyTreeStore";
import { formatGenerationAnchorLabel, isChildEdge } from "../../store/familyTreeStore";
import Input from "../ui/Input";

function ParentsSection({
  personId,
  nodes,
  edges,
  onSelectParent,
}: {
  personId: string;
  nodes: { id: string; type?: string; data: unknown }[];
  edges: Edge[];
  onSelectParent: (id: string) => void;
}) {
  const parentUnions = edges
    .filter((e) => isChildEdge(e) && e.target === personId)
    .map((e) => e.source);

  if (parentUnions.length === 0) {
    return (
      <div className="mb-4">
        <label className="block text-dark-muted text-sm mb-2">Parents</label>
        <p className="text-dark-muted text-sm">—</p>
      </div>
    );
  }

  const unionId = parentUnions[0]!;
  const unionNode = nodes.find((n) => n.id === unionId && n.type === "union");
  if (!unionNode) {
    return (
      <div className="mb-4">
        <label className="block text-dark-muted text-sm mb-2">Parents</label>
        <p className="text-dark-muted text-sm">—</p>
      </div>
    );
  }

  const unionData = unionNode.data as UnionNodeData;
  const leftId = unionData.leftPartnerId ?? unionData.partnerIds?.[0];
  const rightId = unionData.rightPartnerId ?? unionData.partnerIds?.[1];
  const parentIds = [leftId, rightId].filter((id): id is string => id != null);

  const parentNodes = parentIds.map((id) => nodes.find((n) => n.id === id && n.type === "person"));
  const names = parentNodes.map(
    (n) => (n?.data as PersonNodeData | undefined)?.name ?? "Unknown"
  );

  const hasMultipleUnions = parentUnions.length > 1;

  return (
    <div className="mb-4">
      <label className="block text-dark-muted text-sm mb-2">
        Parents{hasMultipleUnions ? " (showing first)" : ""}
      </label>
      {hasMultipleUnions && (
        <p className="text-dark-muted text-xs mb-1">
          Multiple parent links detected.
        </p>
      )}
      <div className="space-y-1">
        {parentIds.map((id, i) => {
          const name = names[i] ?? "Unknown";
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectParent(id)}
              className="block w-full text-left text-dark-text text-sm hover:text-blue-400 hover:underline"
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PartnersDisplay({
  nodes,
  unionData,
}: {
  nodes: { id: string; type?: string; data: unknown }[];
  unionData: UnionNodeData;
}) {
  const ids = unionData.leftPartnerId && unionData.rightPartnerId
    ? [unionData.leftPartnerId, unionData.rightPartnerId]
    : unionData.partnerIds ?? [];
  const names = ids.map((pid) => {
    const partner = nodes.find((n) => n.id === pid && n.type === "person");
    return (partner?.data as PersonNodeData | undefined)?.name ?? pid;
  });
  const sep = unionData.leftPartnerId && unionData.rightPartnerId ? " \u2014 " : ", ";
  return <p className="text-dark-text text-sm">{names.join(sep) || "\u2014"}</p>;
}

function getSwapPartnersState(
  unionData: UnionNodeData,
  nodes: { id: string; type?: string }[]
): { canSwap: boolean; tooltip: string } {
  if (!unionData.leftPartnerId || !unionData.rightPartnerId) {
    return { canSwap: false, tooltip: "Partner order not yet set. Run Sort first." };
  }
  if (!unionData.partnerIds || unionData.partnerIds.length !== 2) {
    return { canSwap: false, tooltip: "Invalid union data." };
  }
  const leftExists = nodes.some((n) => n.id === unionData.leftPartnerId && n.type === "person");
  const rightExists = nodes.some((n) => n.id === unionData.rightPartnerId && n.type === "person");
  if (!leftExists || !rightExists) {
    return { canSwap: false, tooltip: "Partner nodes not found." };
  }
  return { canSwap: true, tooltip: "Swap partners" };
}

function SwapPartnersButton({
  unionData,
  unionId,
  swapUnionPartners,
  nodes,
}: {
  unionData: UnionNodeData;
  unionId: string;
  swapUnionPartners: (id: string) => boolean;
  nodes: { id: string; type?: string }[];
}) {
  const { canSwap, tooltip } = getSwapPartnersState(unionData, nodes);
  const fullTooltip = canSwap ? "Swap left and right partner. Run Sort to reflow layout." : tooltip;
  return (
    <button
      type="button"
      disabled={!canSwap}
      onClick={() => swapUnionPartners(unionId)}
      title={fullTooltip}
      className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-dark-accent/50"
    >
      Swap Partners
    </button>
  );
}

function SwapPartnersIconButton({
  unionData,
  unionId,
  swapUnionPartners,
  nodes,
}: {
  unionData: UnionNodeData;
  unionId: string;
  swapUnionPartners: (id: string) => boolean;
  nodes: { id: string; type?: string }[];
}) {
  const { canSwap, tooltip } = getSwapPartnersState(unionData, nodes);
  return (
    <button
      type="button"
      disabled={!canSwap}
      onClick={() => swapUnionPartners(unionId)}
      title={tooltip}
      className="w-7 h-7 flex items-center justify-center rounded border border-dark-accent/50 hover:bg-dark-accent/20 hover:border-dark-accent text-dark-muted hover:text-dark-text cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span className="text-sm" aria-hidden="true">↔</span>
    </button>
  );
}

export default function FamilyTreeInspector() {
  const {
    nodes,
    edges,
    primarySelectedNodeId,
    anchorNodeId,
    setAnchorNodeId,
    setSelectedNodeIds,
    updateNodeName,
    updateNodeNotes,
    swapUnionPartners,
    generationAnchors,
    genLabelMode,
    updateNodeGenAnchor,
  } = useFamilyTreeStore();

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
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide flex-1">
          Inspector
        </h3>
        {data.kind === "union" && (
          <SwapPartnersIconButton
            unionData={data as UnionNodeData}
            unionId={selectedNode.id}
            swapUnionPartners={swapUnionPartners}
            nodes={nodes}
          />
        )}
      </div>
      <p className="text-dark-muted text-xs mb-3 font-mono">{selectedNode.id}</p>

      {data.kind === "person" ? (
        <>
          <div className="mb-4 flex flex-col gap-2">
            {anchorNodeId === selectedNode.id ? (
              <button
                type="button"
                onClick={() => setAnchorNodeId(null)}
                className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent"
              >
                Clear Anchor
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAnchorNodeId(selectedNode.id)}
                className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent"
              >
                Set as Anchor
              </button>
            )}
          </div>
          <div className="mb-4">
            <label className="block text-dark-muted text-sm mb-2">Generation anchor</label>
            <select
              value={(data as PersonNodeData).genAnchorId ?? ""}
              onChange={(e) => updateNodeGenAnchor(selectedNode.id, e.target.value || null)}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">None</option>
              {generationAnchors.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatGenerationAnchorLabel(a, genLabelMode)}
                  {a.customLabel ? ` — ${a.customLabel}` : ""}
                </option>
              ))}
            </select>
          </div>
          <ParentsSection
            personId={selectedNode.id}
            nodes={nodes}
            edges={edges}
            onSelectParent={(id) => setSelectedNodeIds([id])}
          />
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
            <PartnersDisplay nodes={nodes} unionData={data as UnionNodeData} />
          </div>
          <div className="mb-4">
            <SwapPartnersButton
              unionData={data as UnionNodeData}
              unionId={selectedNode.id}
              swapUnionPartners={swapUnionPartners}
              nodes={nodes}
            />
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
