import { useRef, useEffect, useCallback } from "react";

/** Minimum height in px; default ~2.5rem for one line with padding. Use smaller (e.g. 28) for tighter single-line. */
function resizeTextarea(ta: HTMLTextAreaElement | null, minHeightPx = 40) {
  if (!ta) return;
  ta.style.height = "auto";
  const h = Math.max(minHeightPx, ta.scrollHeight);
  ta.style.height = `${h}px`;
}

export interface AutoResizeTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  value: string;
  onChange?: (value: string) => void;
  /** Min height in px when wrapping to content. Default 40. Use ~28 for single-line minimal. */
  minHeightPx?: number;
}

export default function AutoResizeTextarea({
  value,
  onChange,
  onInput,
  className = "",
  minHeightPx = 40,
  ...rest
}: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      onInput?.(e);
      resizeTextarea(ref.current, minHeightPx);
    },
    [onInput, minHeightPx]
  );

  useEffect(() => {
    resizeTextarea(ref.current, minHeightPx);
  }, [value, minHeightPx]);

  const minHeightClass = minHeightPx <= 28 ? "min-h-[1.75rem]" : "min-h-[2.5rem]";

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      onInput={handleInput}
      rows={1}
      wrap="soft"
      className={`overflow-hidden resize-none whitespace-pre-wrap ${minHeightClass} ${className}`}
      {...rest}
    />
  );
}
