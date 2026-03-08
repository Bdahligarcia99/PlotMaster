import { useRef, useEffect, useCallback } from "react";

function resizeTextarea(ta: HTMLTextAreaElement | null) {
  if (!ta) return;
  ta.style.height = "auto";
  ta.style.height = `${ta.scrollHeight}px`;
}

export interface AutoResizeTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  value: string;
  onChange?: (value: string) => void;
}

export default function AutoResizeTextarea({
  value,
  onChange,
  onInput,
  className = "",
  ...rest
}: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      onInput?.(e);
      resizeTextarea(ref.current);
    },
    [onInput]
  );

  useEffect(() => {
    resizeTextarea(ref.current);
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      onInput={handleInput}
      rows={1}
      className={`overflow-hidden resize-none min-h-[2.5rem] ${className}`}
      {...rest}
    />
  );
}
