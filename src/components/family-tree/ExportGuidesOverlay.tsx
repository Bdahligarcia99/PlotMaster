import { useStore, useReactFlow } from "reactflow";
import { useFamilyTreeStore } from "../../store/familyTreeStore";

/** Letter page aspect ratio (8.5:11). */
const LETTER_ASPECT = 11 / 8.5;

/** Base page size in flow units: width, then height = width * aspect. */
const BASE_PAGE_WIDTH = 400;
const BASE_PAGE_HEIGHT = BASE_PAGE_WIDTH * LETTER_ASPECT;

/**
 * Discrete scale steps: single-page zoom (0.25–1) and center-out odd grids (2–6 → 3×3, 5×5, …).
 * Scale ≤ 1: single page (size scaled by scale, min 0.25).
 * Scale 2–6: odd grid size n = 2*scale − 1 (e.g. 2→3×3, 3→5×5, 6→11×11).
 */
const GRID_SCALE_STEPS = [0.25, 0.5, 0.75, 1, 2, 3, 4, 5, 6] as const;

export function getExportGuideScaleSteps(): readonly number[] {
  return GRID_SCALE_STEPS;
}

/** Snap scale to nearest discrete step. */
export function snapExportGuideScale(scale: number): number {
  let best: number = GRID_SCALE_STEPS[0];
  for (const s of GRID_SCALE_STEPS) {
    if (Math.abs(s - scale) < Math.abs(best - scale)) best = s;
  }
  return best;
}

function getGridLayout(scale: number): {
  gridSize: number;
  singlePageScale: number;
} {
  if (scale <= 1) {
    return { gridSize: 1, singlePageScale: Math.max(0.25, scale) };
  }
  // scale 2 → n=3, scale 3 → n=5, scale 4 → n=7, scale 5 → n=9, scale 6 → n=11
  const gridSize = 2 * Math.round(scale) - 1;
  return { gridSize: Math.max(1, gridSize), singlePageScale: 1 };
}

/** Renders dashed page guides in flow coordinates. Center-out odd grid (1×1, 3×3, 5×5, …). */
export default function ExportGuidesOverlay() {
  const { flowToScreenPosition } = useReactFlow();
  const domNode = useStore((s) => s.domNode);
  const exportGuideScale = useFamilyTreeStore((s) => s.exportGuideScale);

  if (!domNode) return null;

  const rect = domNode.getBoundingClientRect();
  const { gridSize, singlePageScale } = getGridLayout(exportGuideScale);

  const pageWidthFlow = BASE_PAGE_WIDTH * singlePageScale;
  const pageHeightFlow = BASE_PAGE_HEIGHT * singlePageScale;

  const flowToScreen = (fx: number, fy: number) => {
    const p = flowToScreenPosition({ x: fx, y: fy });
    return { x: p.x - rect.left, y: p.y - rect.top };
  };

  const rectangles: { left: number; top: number; width: number; height: number }[] = [];
  const half = (gridSize - 1) / 2; // 0 for 1×1, 1 for 3×3, 2 for 5×5, etc.

  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      const fx = col * pageWidthFlow;
      const fy = row * pageHeightFlow;
      const topLeft = flowToScreen(fx, fy);
      const bottomRight = flowToScreen(fx + pageWidthFlow, fy + pageHeightFlow);

      rectangles.push({
        left: topLeft.x,
        top: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      });
    }
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden>
      {rectangles.map((r, i) => (
        <div
          key={i}
          className="absolute border-2 border-dashed border-blue-400/70"
          style={{
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
          }}
        />
      ))}
    </div>
  );
}
