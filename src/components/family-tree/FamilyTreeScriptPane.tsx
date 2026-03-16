import { useMemo, useState } from "react";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import { generateFamilyTreeScript } from "../../store/familyTreeStore";

/** Escape string for use in RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True if line references the given node by its unique ID. */
function lineReferencesNode(line: string, nodeId: string): boolean {
  // Match ID as whole token (avoid "_fz94" matching inside "_fz94vsg4l")
  const idEscaped = escapeRegex(nodeId);
  const idRe = new RegExp(`(?:^|[^a-zA-Z0-9_])${idEscaped}(?:$|[^a-zA-Z0-9_])`);
  return idRe.test(line);
}

export default function FamilyTreeScriptPane() {
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const edges = useFamilyTreeStore((s) => s.edges);
  const primarySelectedNodeId = useFamilyTreeStore((s) => s.primarySelectedNodeId);
  const generationAnchors = useFamilyTreeStore((s) => s.generationAnchors);
  const genLabelMode = useFamilyTreeStore((s) => s.genLabelMode);
  const showNodeInfoEnabled = useFamilyTreeStore((s) => s.showNodeInfoEnabled);
  const nodeInfoTopLeft = useFamilyTreeStore((s) => s.nodeInfoTopLeft);
  const nodeInfoCenter = useFamilyTreeStore((s) => s.nodeInfoCenter);
  const nodeInfoSize = useFamilyTreeStore((s) => s.nodeInfoSize);
  const nodeSizesById = useFamilyTreeStore((s) => s.nodeSizesById);
  const scriptPanelLayout = useFamilyTreeStore((s) => s.scriptPanelLayout);
  const setScriptPanelLayout = useFamilyTreeStore((s) => s.setScriptPanelLayout);
  const [copied, setCopied] = useState(false);
  const [compactDeclarations, setCompactDeclarations] = useState(false);

  const script = useMemo(
    () =>
      generateFamilyTreeScript(nodes, edges, {
        compactDeclarations,
        showNodeInfo: showNodeInfoEnabled,
        nodeInfoTopLeft,
        nodeInfoCenter,
        nodeInfoSize,
        nodeSizesById,
        generationAnchors,
        genLabelMode,
      }),
    [nodes, edges, compactDeclarations, showNodeInfoEnabled, nodeInfoTopLeft, nodeInfoCenter, nodeInfoSize, nodeSizesById, generationAnchors, genLabelMode]
  );

  const scriptLines = useMemo(() => script.split("\n"), [script]);

  const selectedNodeId = useMemo(() => {
    if (!primarySelectedNodeId) return null;
    const node = nodes.find((n) => n.id === primarySelectedNodeId);
    return node ? node.id : null;
  }, [primarySelectedNodeId, nodes]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignored */
    }
  };

  const showCode = scriptPanelLayout === "split" || scriptPanelLayout === "codeOnly";
  const showView = scriptPanelLayout === "split" || scriptPanelLayout === "viewOnly";

  const layoutBtn = (mode: "split" | "codeOnly" | "viewOnly", label: string) => (
    <button
      type="button"
      onClick={() => setScriptPanelLayout(mode)}
      className={`px-2 py-1 text-xs rounded border transition-colors ${
        scriptPanelLayout === mode
          ? "bg-dark-accent border-dark-accent text-dark-text"
          : "border-dark-accent/50 text-dark-muted hover:text-dark-text hover:border-dark-accent"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-full flex flex-col border-t border-dark-accent/50 bg-dark-surface">
      {/* Script panel header with layout controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-b border-dark-accent/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">Script</span>
          <span className="text-dark-accent/50">|</span>
          <span className="text-xs text-dark-muted">Layout:</span>
          {layoutBtn("split", "Split")}
          {layoutBtn("codeOnly", "Code")}
          {layoutBtn("viewOnly", "View")}
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Code pane */}
        <div
          className={`flex flex-col min-w-0 ${
            scriptPanelLayout === "split" ? "border-r border-dark-accent/50" : ""
          } ${showCode ? "flex-1" : "hidden"}`}
        >
          <div className="flex items-center px-3 py-1.5 border-b border-dark-accent/30 shrink-0">
            <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">Code</span>
          </div>
          <div className="flex-1 overflow-hidden p-3">
            <textarea
              readOnly
              value="(Code editor coming soon)"
              className="w-full h-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm font-mono resize-none focus:outline-none"
            />
          </div>
        </div>

        {/* Vertical divider (split only) */}
        {scriptPanelLayout === "split" && (
          <div className="w-px shrink-0 bg-dark-accent/50" aria-hidden />
        )}

        {/* View pane */}
        <div
          className={`flex flex-col min-w-0 ${showView ? "flex-1" : "hidden"}`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-1.5 border-b border-dark-accent/30 shrink-0">
            <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">View</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-dark-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={compactDeclarations}
                  onChange={(e) => setCompactDeclarations(e.target.checked)}
                  className="rounded border-dark-accent bg-dark-bg text-blue-500 focus:ring-blue-500/50"
                />
                <span>Compact declarations</span>
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-3">
            <div
              className="block w-full min-h-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm font-mono"
              aria-label="Script view"
              role="document"
            >
              {scriptLines.map((line, i) => {
                const highlight =
                  selectedNodeId &&
                  lineReferencesNode(line, selectedNodeId);
                return (
                  <div
                    key={i}
                    className={highlight ? "bg-blue-500/15 -mx-3 px-3 py-0.5" : ""}
                  >
                    {line || "\u00a0"}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
