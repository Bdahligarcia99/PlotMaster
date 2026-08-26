import { useState } from "react";
import type {
  AttributeMetaItem,
  AttributeType,
  CustomDataType,
} from "../../store/chartsStore";

export interface AttributeMetaEditorPopoverProps {
  keyName: string;
  meta?: AttributeMetaItem;
  customDataTypes: CustomDataType[];
  onAddCustomDataType: (name: string, options: string[]) => string;
  onSave: (m: Partial<AttributeMetaItem>) => void;
  onClose: () => void;
  anchorRect: DOMRect | null;
}

export default function AttributeMetaEditorPopover({
  keyName,
  meta,
  customDataTypes,
  onAddCustomDataType,
  onSave,
  onClose,
  anchorRect,
}: AttributeMetaEditorPopoverProps) {
  const rawType = meta?.type ?? "text";
  const isCustom = rawType === "custom";
  const [type, setType] = useState<AttributeType>(isCustom ? "custom" : rawType);
  const [customTypeId, setCustomTypeId] = useState<string | undefined>(meta?.customTypeId);
  const [allowCustom, setAllowCustom] = useState(meta?.allowCustom ?? false);
  const [min, setMin] = useState<string>(meta?.min != null ? String(meta.min) : "");
  const [max, setMax] = useState<string>(meta?.max != null ? String(meta.max) : "");
  const [step, setStep] = useState<string>(meta?.step != null ? String(meta.step) : "1");
  const [showCreateType, setShowCreateType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeOptions, setNewTypeOptions] = useState("");
  const rect = anchorRect;

  const selectOptions = [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "numberScroll", label: "Number (Scrollable)" },
    { value: "date", label: "Date" },
    ...customDataTypes.map((t) => ({ value: `custom:${t.id}`, label: t.name })),
    { value: "__create__", label: "Create new data type…" },
  ];

  const handleTypeChange = (val: string) => {
    if (val === "__create__") {
      setShowCreateType(true);
      return;
    }
    setShowCreateType(false);
    if (val.startsWith("custom:")) {
      setType("custom");
      setCustomTypeId(val.slice(7));
    } else {
      setType(val as AttributeType);
      setCustomTypeId(undefined);
    }
  };

  const handleCreateType = () => {
    const name = newTypeName.trim() || "New Type";
    const opts = newTypeOptions.split("\n").map((s) => s.trim()).filter(Boolean);
    if (opts.length === 0) opts.push("");
    const id = onAddCustomDataType(name, opts);
    setType("custom");
    setCustomTypeId(id);
    setShowCreateType(false);
    setNewTypeName("");
    setNewTypeOptions("");
  };

  const handleSave = () => {
    const payload: Partial<AttributeMetaItem> = {
      type,
      customTypeId: type === "custom" ? customTypeId : undefined,
      options: undefined,
      allowCustom: type === "custom" ? allowCustom : undefined,
      min: undefined,
      max: undefined,
      step: undefined,
    };
    if (type === "number" || type === "numberScroll") {
      const minNum = min.trim() === "" ? undefined : parseFloat(min);
      const maxNum = max.trim() === "" ? undefined : parseFloat(max);
      const stepNum = step.trim() === "" ? undefined : parseFloat(step);
      if (!Number.isNaN(minNum)) payload.min = minNum;
      if (!Number.isNaN(maxNum)) payload.max = maxNum;
      if (!Number.isNaN(stepNum)) payload.step = stepNum;
    }
    onSave(payload);
    onClose();
  };

  return (
    <div
      className="fixed z-[9999] rounded-lg border border-dark-accent bg-dark-surface shadow-xl p-3 min-w-[200px] max-w-[280px]"
      style={{ top: rect ? rect.bottom + 4 : 0, left: rect ? rect.left : 0 }}
    >
      <div className="text-xs font-medium text-dark-muted mb-2">Attribute: {keyName}</div>
      <div className="space-y-2">
        <div>
          <label className="block text-[10px] text-dark-muted mb-0.5">Type</label>
          <select
            value={type === "custom" && customTypeId ? `custom:${customTypeId}` : type}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="w-full px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded text-dark-text"
          >
            {selectOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {showCreateType && (
          <div className="space-y-2 p-2 rounded border border-dark-accent/50 bg-dark-bg/50">
            <input
              type="text"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="Type name (e.g. Blood Type)"
              className="w-full px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded"
            />
            <textarea
              value={newTypeOptions}
              onChange={(e) => setNewTypeOptions(e.target.value)}
              rows={3}
              placeholder="Options, one per line"
              className="w-full px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded resize-y"
            />
            <div className="flex gap-1">
              <button type="button" onClick={() => setShowCreateType(false)} className="px-2 py-1 text-xs text-dark-muted">Cancel</button>
              <button type="button" onClick={handleCreateType} className="px-2 py-1 text-xs bg-blue-600 text-white rounded">Create & assign</button>
            </div>
          </div>
        )}
        {(type === "number" || type === "numberScroll") && (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] text-dark-muted mb-0.5">Min</label>
              <input type="number" value={min} onChange={(e) => setMin(e.target.value)} placeholder="—" className="w-full px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded" />
            </div>
            <div>
              <label className="block text-[10px] text-dark-muted mb-0.5">Max</label>
              <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder="—" className="w-full px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded" />
            </div>
            <div>
              <label className="block text-[10px] text-dark-muted mb-0.5">Step</label>
              <input type="number" value={step} onChange={(e) => setStep(e.target.value)} placeholder="1" min={0.0001} step={0.1} className="w-full px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded" />
            </div>
          </div>
        )}
        {type === "custom" && !showCreateType && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={allowCustom} onChange={(e) => setAllowCustom(e.target.checked)} className="rounded" />
            <span className="text-xs text-dark-text">Allow custom values</span>
          </label>
        )}
      </div>
      <div className="flex justify-end gap-1 mt-2">
        <button type="button" onClick={onClose} className="px-2 py-1 text-xs text-dark-muted hover:text-dark-text">Cancel</button>
        <button type="button" onClick={handleSave} className="px-2 py-1 text-xs bg-blue-600 text-white rounded">Save</button>
      </div>
    </div>
  );
}
