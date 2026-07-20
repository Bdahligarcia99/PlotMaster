import type { TimelineOrientation } from "../../storage/StorageDriver";

interface TimelineCanvasPlaceholderProps {
  orientation?: TimelineOrientation;
}

export default function TimelineCanvasPlaceholder({
  orientation = "vertical",
}: TimelineCanvasPlaceholderProps) {
  return (
    <div className="flex-1 m-4 rounded-xl border-2 border-dashed border-dark-accent/50 flex items-center justify-center bg-dark-surface/30 min-h-0">
      <div className="text-center text-dark-muted">
        <p className="text-sm font-medium">Timeline Canvas</p>
        <p className="text-xs mt-1">Phase 1 — lanes and beats coming soon</p>
        <p className="text-xs mt-2 text-dark-muted/80">
          Orientation: {orientation === "vertical" ? "vertical (time ↑)" : "horizontal (time →)"}
        </p>
      </div>
    </div>
  );
}
