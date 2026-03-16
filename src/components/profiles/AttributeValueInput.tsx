import { useRef, useEffect } from "react";
import type { AttributeMetaItem, CustomDataType } from "../../store/characterProfilesStore";

function NumberScrollWheel({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const num = valueRef.current === "" ? NaN : parseFloat(valueRef.current);
      const base = Number.isNaN(num) ? (min ?? 0) : num;
      const delta = e.deltaY < 0 ? step : -step;
      const next = base + delta;
      const clamped = min != null && next < min ? min : max != null && next > max ? max : next;
      onChange(String(clamped));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [onChange, step, min, max]);

  return (
    <div ref={containerRef} className={`flex flex-col gap-0.5 ${className ?? ""}`} style={{ overscrollBehavior: "contain" }}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className="w-full px-2 py-1.5 text-sm bg-dark-bg border border-dark-accent/40 rounded text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-blue-500"
      />
      <span className="text-[10px] text-dark-muted">Scroll to change value</span>
    </div>
  );
}

export interface AttributeValueInputProps {
  value: string;
  onChange: (v: string) => void;
  meta?: AttributeMetaItem;
  customDataTypes?: CustomDataType[];
  inputId: string;
  placeholder?: string;
  className?: string;
}

/**
 * Renders the appropriate input for an attribute value based on meta type:
 * - number → number input
 * - select + options → dropdown or combobox (when allowCustom)
 * - default → text input
 */
export default function AttributeValueInput({
  value,
  onChange,
  meta,
  customDataTypes = [],
  inputId,
  placeholder,
  className,
}: AttributeValueInputProps) {
  const rawType = meta?.type ?? "text";
  const isCustom = rawType === "custom";
  const customType = isCustom && meta?.customTypeId
    ? customDataTypes.find((t) => t.id === meta.customTypeId)
    : null;
  const type = isCustom ? (customType ? "select" : "text") : rawType;
  const options = isCustom && customType ? customType.options : (meta?.options ?? []);
  const allowCustom = meta?.allowCustom ?? false;
  const min = meta?.min;
  const max = meta?.max;
  const step = meta?.step ?? 1;

  if (type === "date") {
    return (
      <input
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
    );
  }

  if (type === "numberScroll") {
    const st = step ?? 1;
    return (
      <NumberScrollWheel
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        max={max}
        step={st}
        className={className}
      />
    );
  }

  if (type === "number") {
    const num = value === "" ? NaN : parseFloat(value);
    const isValidNum = !Number.isNaN(num);
    const st = step ?? 1;
    const handleStep = (delta: number) => {
      const base = isValidNum ? num : (min ?? 0);
      const next = base + delta;
      const clamped = min != null && next < min ? min : max != null && next > max ? max : next;
      onChange(String(clamped));
    };
    const inputClass = "flex-1 min-w-0 border-0 px-2 py-1.5 text-sm bg-dark-bg text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-blue-500";
    return (
      <div className={`flex items-center rounded overflow-hidden border border-dark-accent/40 ${className ?? ""}`} onWheel={(e) => e.preventDefault()}>
        <button
          type="button"
          onClick={() => handleStep(-st)}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-dark-bg text-dark-muted hover:text-dark-text hover:bg-dark-accent/20 border-r border-dark-accent/40"
          aria-label="Decrease"
        >
          −
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
          step={st}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => handleStep(st)}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-dark-bg text-dark-muted hover:text-dark-text hover:bg-dark-accent/20 border-l border-dark-accent/40"
          aria-label="Increase"
        >
          +
        </button>
      </div>
    );
  }

  if (type === "select" && options.length > 0) {
    if (allowCustom) {
      return (
        <>
          <input
            list={`opts-${inputId}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={className}
          />
          <datalist id={`opts-${inputId}`}>
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </>
      );
    }
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        <option value="">{placeholder ?? "Select..."}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {value && !options.includes(value) && (
          <option value={value}>{value} (custom)</option>
        )}
      </select>
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}
