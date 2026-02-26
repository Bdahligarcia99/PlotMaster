import { useMemo, useState } from "react";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import { generateFamilyTreeScript } from "../../store/familyTreeStore";

export default function FamilyTreeScriptPane() {
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const edges = useFamilyTreeStore((s) => s.edges);
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
      }),
    [nodes, edges, compactDeclarations, showNodeInfoEnabled, nodeInfoTopLeft, nodeInfoCenter, nodeInfoSize, nodeSizesById]
  );

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
          <div className="flex-1 overflow-hidden p-3">
            <textarea
              value={script}
              readOnly
              className="w-full h-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm font-mono resize-none focus:outline-none focus:border-blue-500"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
