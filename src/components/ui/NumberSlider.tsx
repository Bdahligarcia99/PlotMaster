interface NumberSliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  className?: string;
}

export default function NumberSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  className = "",
}: NumberSliderProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className={`mb-4 ${className}`}>
      {label && <label className="block text-dark-muted text-sm mb-2">{label}</label>}
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
          className="flex-1 h-1.5 accent-blue-500"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!Number.isNaN(n)) onChange(clamp(n));
          }}
          className="w-16 px-2 py-1.5 bg-dark-bg border border-dark-accent rounded-lg 
            text-dark-text text-sm text-center
            focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
