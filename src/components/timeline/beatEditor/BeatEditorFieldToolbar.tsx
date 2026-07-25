import Button from "../../ui/Button";
import { useTimelineStore } from "../../../store/timelineStore";
import type { BeatFieldKey } from "./beatDocumentModel";
import type { FieldDisableFlags } from "./beatDocumentModel";

export type BeatEditorTool = BeatFieldKey | null;

interface BeatEditorFieldToolbarProps {
  activeTool: BeatEditorTool;
  onToolChange: (tool: BeatEditorTool) => void;
  disabledFields: FieldDisableFlags;
  onToggleField: (field: keyof FieldDisableFlags) => void;
  onAutoDetectFields: () => void;
  onInsertSeparator: () => void;
  autoDetectDisabled?: boolean;
  prefixPanelOpen: boolean;
  onTogglePrefixPanel: () => void;
  newPrefix: string;
  onNewPrefixChange: (v: string) => void;
  onAddPrefix: () => void;
  onRemovePrefix: (prefix: string) => void;
  activePrefixes: Set<string>;
  onToggleActivePrefix: (prefix: string) => void;
}

const FIELD_TOOLS: { key: BeatFieldKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "synopsis", label: "Synopsis" },
  { key: "detail", label: "Detail" },
  { key: "date", label: "Date" },
];

export default function BeatEditorFieldToolbar({
  activeTool,
  onToolChange,
  disabledFields,
  onToggleField,
  onAutoDetectFields,
  onInsertSeparator,
  autoDetectDisabled = false,
  prefixPanelOpen,
  onTogglePrefixPanel,
  newPrefix,
  onNewPrefixChange,
  onAddPrefix,
  onRemovePrefix,
  activePrefixes,
  onToggleActivePrefix,
}: BeatEditorFieldToolbarProps) {
  const savedPrefixes = useTimelineStore((s) => s.importLabelPrefixes);

  return (
    <div className="flex flex-col gap-2 border-b border-dark-accent/50 pb-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-dark-muted mr-1">Field tools:</span>
        {FIELD_TOOLS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onToolChange(activeTool === key ? null : key)}
            className={`px-2 py-0.5 rounded text-[11px] border ${
              activeTool === key
                ? "border-blue-500 bg-blue-500/20 text-blue-200"
                : "border-dark-accent text-dark-muted hover:text-dark-text"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={onInsertSeparator}
          className="px-2 py-0.5 rounded text-[11px] border border-dark-accent text-dark-muted hover:text-dark-text"
        >
          Separator
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-dark-muted mr-1">Disable auto-detect:</span>
        {(["synopsis", "detail", "date"] as const).map((field) => (
          <button
            key={field}
            type="button"
            onClick={() => onToggleField(field)}
            className={`px-2 py-0.5 rounded text-[11px] border capitalize ${
              disabledFields[field]
                ? "border-red-500/50 bg-red-500/10 text-red-300"
                : "border-dark-accent text-dark-muted"
            }`}
          >
            {field} {disabledFields[field] ? "OFF" : "ON"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={onAutoDetectFields}
          disabled={autoDetectDisabled}
          title="Auto-label pasted beat blocks into Title/Synopsis/Detail/Date fields"
        >
          Auto-detect fields
        </Button>
        <button
          type="button"
          onClick={onTogglePrefixPanel}
          className="text-xs text-dark-muted hover:text-dark-text px-2 py-1"
        >
          Prefix settings {prefixPanelOpen ? "▲" : "▼"}
        </button>
      </div>

      {prefixPanelOpen && (
        <div className="rounded border border-dark-accent/40 p-2 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newPrefix}
              onChange={(e) => onNewPrefixChange(e.target.value)}
              placeholder="e.g. Action:"
              className="flex-1 px-2 py-1 rounded bg-dark-bg border border-dark-accent text-sm"
            />
            <Button variant="secondary" size="sm" onClick={onAddPrefix}>
              Add
            </Button>
          </div>
          {savedPrefixes.length === 0 ? (
            <p className="text-xs text-dark-muted">No saved prefixes.</p>
          ) : (
            <ul className="space-y-1">
              {savedPrefixes.map((prefix) => (
                <li key={prefix} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={activePrefixes.has(prefix)}
                    onChange={() => onToggleActivePrefix(prefix)}
                  />
                  <span className="flex-1 text-dark-text">{prefix}</span>
                  <button
                    type="button"
                    onClick={() => onRemovePrefix(prefix)}
                    className="text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
