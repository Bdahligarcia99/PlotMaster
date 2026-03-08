import { useStore, useReactFlow } from "reactflow";
import { useFamilyTreeStore } from "../../store/familyTreeStore";

/** Renders generation anchor bands (horizontal guidelines + tint) that move with canvas pan/zoom. */
export default function GenerationAnchorsOverlay() {
  const generationAnchors = useFamilyTreeStore((s) => s.generationAnchors);
  const showGenerationAnchors = useFamilyTreeStore((s) => s.showGenerationAnchors);
  const viewportBounds = useFamilyTreeStore((s) => s.viewportBounds);
  const { flowToScreenPosition } = useReactFlow();
  const domNode = useStore((s) => s.domNode);

  if (!showGenerationAnchors || generationAnchors.length === 0 || !domNode || !viewportBounds) return null;

  const rect = domNode.getBoundingClientRect();
  const minX = viewportBounds.minX;
  const maxX = viewportBounds.maxX;

  const sorted = [...generationAnchors].sort((a, b) => a.index - b.index);

  const flowToScreenY = (flowY: number) => {
    const flow = { x: (minX + maxX) / 2, y: flowY };
    const screen = flowToScreenPosition(flow);
    return screen.y - rect.top;
  };

  const guidelineStyle = {
    backgroundColor: "rgba(59,130,246,0.35)",
    height: 2,
  };
  const bandTintStyle = {
    backgroundColor: "rgba(59,130,246,0.06)",
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-0" aria-hidden>
      {/* Shared boundaries: 1 top line + N bottom lines = N+1 guidelines */}
      {/* Top guideline (first anchor only) */}
      <div
        className="absolute left-0 right-0"
        style={{ top: flowToScreenY(sorted[0]!.yTop), ...guidelineStyle }}
      />
      {/* Bottom guideline per anchor + tinted region */}
      {sorted.map((anchor) => {
        const bottomY = anchor.yTop + anchor.height;
        const topScreenY = flowToScreenY(anchor.yTop);
        const bottomScreenY = flowToScreenY(bottomY);
        const height = bottomScreenY - topScreenY;

        return (
          <div key={anchor.id}>
            <div
              className="absolute left-0 right-0"
              style={{ top: bottomScreenY, ...guidelineStyle }}
            />
            <div
              className="absolute left-0 right-0"
              style={{ top: topScreenY, height: Math.max(1, height), ...bandTintStyle }}
            />
          </div>
        );
      })}
    </div>
  );
}
