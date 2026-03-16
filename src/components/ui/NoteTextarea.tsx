import { useEffect, useRef, useState } from "react";
import AutoResizeTextarea from "./AutoResizeTextarea";

const LINES_THRESHOLD = 3;
const LINES_COLLAPSED = 3;

export interface NoteTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  readOnly?: boolean;
}

/**
 * Note textarea that:
 * - ≤3 wrapped lines: height wraps text tightly, minimal min-height, no Show more
 * - >3 lines: collapsed to ~3 lines + "Show more"; expanded = full + "Show less"
 * - Uses visual (wrapped) line count, recalculates on content/resize
 */
export default function NoteTextarea({ value, onChange, placeholder, className = "", compact, readOnly }: NoteTextareaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [lineCount, setLineCount] = useState(1);
  const [lineHeightPx, setLineHeightPx] = useState(20);
  const [expanded, setExpanded] = useState(false);

  const baseClass =
    "w-full px-2 py-1.5 text-sm bg-dark-bg/50 border border-dark-accent/40 rounded text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30";
  const readOnlyClass = readOnly ? "cursor-default focus:border-dark-accent/40 focus:ring-0" : "";

  const measureClass = `${baseClass} ${compact ? "text-xs" : ""}`;
  const textareaClass = `${baseClass} ${compact ? "text-xs" : ""} ${readOnlyClass} ${className}`;

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const recalc = () => {
      if (container.offsetWidth === 0) return;
      const text = value || " ";
      measure.textContent = text;
      measure.style.width = `${container.offsetWidth}px`;
      measure.style.height = "auto";
      measure.style.minHeight = "0";
      const style = getComputedStyle(measure);
      const lh = parseFloat(style.lineHeight) || 20;
      const paddingTop = parseFloat(style.paddingTop) || 0;
      const paddingBottom = parseFloat(style.paddingBottom) || 0;
      const contentHeight = measure.scrollHeight - paddingTop - paddingBottom;
      const count = Math.max(1, Math.ceil(contentHeight / lh));
      setLineCount(count);
      setLineHeightPx(lh);
    };

    recalc();

    const ro = new ResizeObserver(() => recalc());
    ro.observe(container);

    return () => ro.disconnect();
  }, [value]);

  const isLong = lineCount > LINES_THRESHOLD;
  const showCollapsed = isLong && !expanded;

  // When deleting back to ≤3 lines, ensure we're not stuck in expanded
  useEffect(() => {
    if (!isLong && expanded) setExpanded(false);
  }, [isLong, expanded]);

  const paddingPx = 12; // py-1.5 = 6px top + 6px bottom
  const collapsedMaxHeight = LINES_COLLAPSED * lineHeightPx + paddingPx;

  return (
    <div ref={containerRef} className="relative min-w-0">
      {/* Hidden measure div - same font/metrics as textarea */}
      <div
        ref={measureRef}
        aria-hidden
        className={measureClass}
        style={{
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
          top: 0,
          left: 0,
          right: 0,
          width: "100%",
          height: "auto",
          minHeight: 0,
          overflow: "hidden",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      />

      <div className={showCollapsed ? "overflow-y-auto" : undefined} style={showCollapsed ? { maxHeight: collapsedMaxHeight } : undefined}>
        <AutoResizeTextarea
          value={value}
          onChange={readOnly ? undefined : onChange}
          onBlur={readOnly ? undefined : (e) => onChange(e.currentTarget.value)}
          placeholder={placeholder}
          minHeightPx={28}
          className={textareaClass}
          readOnly={readOnly}
        />
      </div>

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
