import { useMemo, useState } from "react";
import {
  generateTimelineScript,
  getPrimarySelection,
  lineReferencesTimelineEntity,
  useTimelineStore,
} from "../../store/timelineStore";

export default function TimelineScriptPane() {
  const lanes = useTimelineStore((s) => s.lanes);
  const beats = useTimelineStore((s) => s.beats);
  const connections = useTimelineStore((s) => s.connections);
  const selection = useTimelineStore((s) => s.selection);
  const scriptPanelLayout = useTimelineStore((s) => s.scriptPanelLayout);
  const setScriptPanelLayout = useTimelineStore((s) => s.setScriptPanelLayout);
  const scriptDraft = useTimelineStore((s) => s.scriptDraft);
  const applyScriptText = useTimelineStore((s) => s.applyScriptText);
  const syncScriptDraftFromModel = useTimelineStore((s) => s.syncScriptDraftFromModel);

  const [copied, setCopied] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [localDraft, setLocalDraft] = useState<string | null>(null);

  const generatedScript = useMemo(
    () => generateTimelineScript(lanes, beats, connections),
    [lanes, beats, connections]
  );

  const codeText = localDraft ?? scriptDraft ?? generatedScript;
  const viewScript = generatedScript;
  const scriptLines = useMemo(() => viewScript.split("\n"), [viewScript]);

  const highlightEntityId = useMemo(() => {
    const primary = getPrimarySelection(selection);
    return primary?.id ?? null;
  }, [selection]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(viewScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignored */
    }
  };

  const handleCodeBlur = () => {
    if (localDraft == null) return;
    const result = applyScriptText(localDraft);
    if (!result.ok) {
      setParseErrors(result.errors);
      return;
    }
    setParseErrors([]);
    setLocalDraft(null);
  };

  const handleSyncFromModel = () => {
    const text = syncScriptDraftFromModel();
    setLocalDraft(text);
    setParseErrors([]);
  };

  const showCode = scriptPanelLayout === "split" || scriptPanelLayout === "codeOnly";
  const showView = scriptPanelLayout === "split" || scriptPanelLayout === "viewOnly";

  const layoutBtn = (mode: "split" | "codeOnly" | "viewOnly", label: string) => (
    <button
      type="button"
      onClick={() => setScriptPanelLayout(mode)}
      className={`px-2 py-1 text-xs rounded border transition-colors ${
        scriptPanelLayout === mode
          ? "bg-dark-accent border-dark-accent text-dark-text"
          : "border-dark-accent/50 text-dark-muted hover:text-dark-text hover:border-dark-accent"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-full flex flex-col border-t border-dark-accent/50 bg-dark-surface">
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-b border-dark-accent/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">Script</span>
          <span className="text-dark-accent/50">|</span>
          <span className="text-xs text-dark-muted">Layout:</span>
          {layoutBtn("split", "Split")}
          {layoutBtn("codeOnly", "Code")}
          {layoutBtn("viewOnly", "View")}
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div
          className={`flex flex-col min-w-0 ${
            scriptPanelLayout === "split" ? "border-r border-dark-accent/50" : ""
          } ${showCode ? "flex-1" : "hidden"}`}
        >
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-dark-accent/30 shrink-0">
            <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">Code</span>
            <button
              type="button"
              onClick={handleSyncFromModel}
              className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50"
            >
              Sync from canvas
            </button>
          </div>
          <div className="flex-1 overflow-hidden p-3 flex flex-col gap-2">
            <textarea
              value={codeText}
              onChange={(e) => {
                setLocalDraft(e.target.value);
                setParseErrors([]);
              }}
              onBlur={handleCodeBlur}
              className="w-full flex-1 px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm font-mono resize-none focus:outline-none focus:border-blue-500"
              spellCheck={false}
            />
            {parseErrors.length > 0 && (
              <div className="text-xs text-red-400 space-y-0.5">
                {parseErrors.map((err) => (
                  <p key={err}>{err}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        {scriptPanelLayout === "split" && <div className="w-px shrink-0 bg-dark-accent/50" aria-hidden />}

        <div className={`flex flex-col min-w-0 ${showView ? "flex-1" : "hidden"}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-1.5 border-b border-dark-accent/30 shrink-0">
            <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">View</span>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-3">
            <div className="block w-full min-h-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm font-mono">
              {scriptLines.map((line, i) => {
                const highlight =
                  highlightEntityId && lineReferencesTimelineEntity(line, highlightEntityId);
                return (
                  <div
                    key={i}
                    className={highlight ? "bg-blue-500/15 -mx-3 px-3 py-0.5" : ""}
                  >
                    {line || "\u00a0"}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
