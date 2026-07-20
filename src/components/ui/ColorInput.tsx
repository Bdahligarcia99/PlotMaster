import { useEffect, useState } from "react";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

interface ColorInputProps {
  label?: string;
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}

export default function ColorInput({ label, value, onChange, className = "" }: ColorInputProps) {
  const [textValue, setTextValue] = useState(value);

  useEffect(() => {
    setTextValue(value);
  }, [value]);

  const handleTextChange = (raw: string) => {
    setTextValue(raw);
    if (HEX_RE.test(raw)) onChange(raw);
  };

  const handleColorChange = (hex: string) => {
    setTextValue(hex);
    onChange(hex);
  };

  return (
    <div className={`mb-4 ${className}`}>
      {label && <label className="block text-dark-muted text-sm mb-2">{label}</label>}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX_RE.test(value) ? value : "#64748b"}
          onChange={(e) => handleColorChange(e.target.value)}
          className="w-10 h-10 rounded border border-dark-accent bg-dark-bg cursor-pointer p-0.5"
        />
        <input
          type="text"
          value={textValue}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="#64748b"
          className="flex-1 px-4 py-3 bg-dark-bg border border-dark-accent rounded-lg 
            text-dark-text placeholder-dark-muted font-mono text-sm
            focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
