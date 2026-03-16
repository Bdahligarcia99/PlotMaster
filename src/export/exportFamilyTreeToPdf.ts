/**
 * PDF export for Family Tree using html2canvas + jspdf.
 * Captures the React Flow viewport and saves as PDF.
 */
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { getStorageDriver } from "../storage/StorageDriver";

export interface ExportOptions {
  layoutMode: "currentView" | "cleanLayout";
  includeNotes: boolean;
  showGenerationBands: boolean;
}

export interface ExportParams {
  viewportEl: HTMLElement;
  projectId: string | null;
  projectName: string;
  options: ExportOptions;
  runLayout: () => void;
  fitView: (() => void) | null;
}

/**
 * Export the family tree viewport to PDF.
 * For "Clean layout": runs layout, fits view, then captures.
 * Honors includeNotes and showGenerationBands via store flags set before capture.
 */
export async function exportFamilyTreeToPdf(params: ExportParams): Promise<void> {
  const { viewportEl, projectName, options, runLayout, fitView } = params;

  if (options.layoutMode === "cleanLayout") {
    runLayout();
    // Allow React to apply layout
    await new Promise((r) => setTimeout(r, 100));
    fitView?.();
    await new Promise((r) => setTimeout(r, 150));
  }

  const canvas = await html2canvas(viewportEl, {
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#0f172a",
    scale: 2,
    logging: false,
    // Capture the viewport content; ignore overlays that might obscure
    ignoreElements: (el) => {
      // Ignore React Flow controls (zoom buttons)
      const className = el.className || "";
      if (typeof className === "string" && className.includes("react-flow__controls")) return true;
      return false;
    },
  });

  const imgData = canvas.toDataURL("image/png", 1.0);
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
  });

  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const imgW = canvas.width;
  const imgH = canvas.height;
  const ratio = Math.min(pdfW / imgW, pdfH / imgH);
  const w = imgW * ratio;
  const h = imgH * ratio;
  const x = (pdfW - w) / 2;
  const y = (pdfH - h) / 2;

  pdf.addImage(imgData, "PNG", x, y, w, h);

  const safeName = (projectName || "Family-Tree").replace(/[^a-zA-Z0-9-_]/g, "_");
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const filename = `${safeName}_${timestamp}.pdf`;

  pdf.save(filename);
}

export async function getProjectName(projectId: string | null): Promise<string> {
  if (!projectId) return "Family-Tree";
  const driver = getStorageDriver();
  const list = await driver.listProjects();
  const p = list.find((x) => x.id === projectId);
  return p?.name ?? "Family-Tree";
}
