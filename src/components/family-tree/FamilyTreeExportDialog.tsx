import { useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { useFamilyTreeStore, generateFamilyTreeScript } from "../../store/familyTreeStore";
import { exportFamilyTreeToPdf, getProjectName } from "../../export/exportFamilyTreeToPdf";

export type ExportLayoutMode = "currentView" | "cleanLayout";

interface FamilyTreeExportDialogProps {
  /** Called when export completes; e.g. show toast */
  onExportComplete?: () => void;
}

export default function FamilyTreeExportDialog({
  onExportComplete,
}: FamilyTreeExportDialogProps = {}) {
  const showExportDialog = useFamilyTreeStore((s) => s.showExportDialog);
  const setShowExportDialog = useFamilyTreeStore((s) => s.setShowExportDialog);
  const exportOptions = useFamilyTreeStore((s) => s.exportOptions);
  const setExportOptions = useFamilyTreeStore((s) => s.setExportOptions);
  const activeProjectId = useFamilyTreeStore((s) => s.activeProjectId);
  const exportViewportEl = useFamilyTreeStore((s) => s.exportViewportEl);
  const fitViewForExport = useFamilyTreeStore((s) => s.fitViewForExport);
  const runLayout = useFamilyTreeStore((s) => s.runLayout);
  const setExportCaptureFlags = useFamilyTreeStore((s) => s.setExportCaptureFlags);
  const setShowGenerationAnchors = useFamilyTreeStore((s) => s.setShowGenerationAnchors);
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const edges = useFamilyTreeStore((s) => s.edges);
  const showNodeInfoEnabled = useFamilyTreeStore((s) => s.showNodeInfoEnabled);
  const nodeInfoTopLeft = useFamilyTreeStore((s) => s.nodeInfoTopLeft);
  const nodeInfoCenter = useFamilyTreeStore((s) => s.nodeInfoCenter);
  const nodeInfoSize = useFamilyTreeStore((s) => s.nodeInfoSize);
  const nodeSizesById = useFamilyTreeStore((s) => s.nodeSizesById);
  const generationAnchors = useFamilyTreeStore((s) => s.generationAnchors);
  const genLabelMode = useFamilyTreeStore((s) => s.genLabelMode);

  const [scriptExportError, setScriptExportError] = useState<string | null>(null);

  const handleExportPdf = async () => {
    setShowExportDialog(false);

    const viewportEl = exportViewportEl;
    if (!viewportEl) {
      onExportComplete?.();
      return;
    }

    const projectName = await getProjectName(activeProjectId);
    const prevShowAnchors = useFamilyTreeStore.getState().showGenerationAnchors;
    setShowGenerationAnchors(exportOptions.showGenerationBands);
    setExportCaptureFlags({ includeNotes: exportOptions.includeNotes });

    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));

    try {
      await exportFamilyTreeToPdf({
        viewportEl,
        projectId: activeProjectId,
        projectName,
        options: {
          layoutMode: exportOptions.layoutMode,
          includeNotes: exportOptions.includeNotes,
          showGenerationBands: exportOptions.showGenerationBands,
        },
        runLayout: () => runLayout(),
        fitView: fitViewForExport,
      });
    } finally {
      setShowGenerationAnchors(prevShowAnchors);
      setExportCaptureFlags(null);
    }
    onExportComplete?.();
  };

  const handleExportScript = async () => {
    setScriptExportError(null);
    const script = generateFamilyTreeScript(nodes, edges, {
      compactDeclarations: false,
      showNodeInfo: showNodeInfoEnabled,
      nodeInfoTopLeft,
      nodeInfoCenter,
      nodeInfoSize,
      nodeSizesById,
      generationAnchors,
      genLabelMode,
    });
    if (!script.trim()) {
      setScriptExportError("Script is empty");
      return;
    }
    const projectName = await getProjectName(activeProjectId);
    const safeName = (projectName || "Family-Tree").replace(/[^a-zA-Z0-9-_]/g, "_");
    const filename = `${safeName}-script.txt`;
    const blob = new Blob([script], { type: "text/plain;charset=utf-8" });

    try {
      const picker = (window as unknown as { showSaveFilePicker?: (opts: { suggestedName?: string; types?: { description?: string; accept?: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
      if (typeof picker === "function") {
        const handle = await picker({
          suggestedName: filename,
          types: [{ description: "Plain text", accept: { "text/plain": [".txt"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      setShowExportDialog(false);
      onExportComplete?.();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setScriptExportError(err instanceof Error ? err.message : "Export failed");
    }
  };

  return (
    <Modal
      isOpen={showExportDialog}
      onClose={() => {
        setShowExportDialog(false);
        setScriptExportError(null);
      }}
      title="Export"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-dark-text mb-2">
            Layout mode
          </label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="layoutMode"
                checked={exportOptions.layoutMode === "currentView"}
                onChange={() => setExportOptions({ layoutMode: "currentView" })}
                className="border-dark-accent bg-dark-bg text-blue-500 focus:ring-blue-500/50"
              />
              <span className="text-sm text-dark-text">Current view</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="layoutMode"
                checked={exportOptions.layoutMode === "cleanLayout"}
                onChange={() => setExportOptions({ layoutMode: "cleanLayout" })}
                className="border-dark-accent bg-dark-bg text-blue-500 focus:ring-blue-500/50"
              />
              <span className="text-sm text-dark-text">Clean layout</span>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={exportOptions.includeNotes}
              onChange={(e) =>
                setExportOptions({ includeNotes: e.target.checked })
              }
              className="rounded border-dark-accent bg-dark-bg text-blue-500 focus:ring-blue-500/50"
            />
            <span className="text-sm text-dark-text">Include notes</span>
          </label>
          <label className="flex items-center gap-2 cursor-not-allowed opacity-60">
            <input
              type="checkbox"
              checked={false}
              disabled
              readOnly
              className="rounded border-dark-accent bg-dark-bg text-blue-500"
            />
            <span className="text-sm text-dark-muted">
              Include legend
              <span className="ml-1 text-xs">(Coming soon)</span>
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={exportOptions.showGenerationBands}
              onChange={(e) =>
                setExportOptions({ showGenerationBands: e.target.checked })
              }
              className="rounded border-dark-accent bg-dark-bg text-blue-500 focus:ring-blue-500/50"
            />
            <span className="text-sm text-dark-text">Show generation bands</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark-text mb-2">
            Format
          </label>
          <div className="text-sm text-dark-muted space-y-1">
            <div>PDF (primary)</div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportScript}
              className="mt-1"
            >
              Export script as plain text
            </Button>
            {scriptExportError && (
              <p className="text-amber-400 text-xs mt-1">{scriptExportError}</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowExportDialog(false)}
          >
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleExportPdf}>
            Export PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
}
