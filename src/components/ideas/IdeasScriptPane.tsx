import { useState } from "react";
import ScriptPaneHeader, { type ScriptPaneView } from "../ui/ScriptPaneHeader";
import LogFeedView from "../logging/LogFeedView";
import { formatLogForCopy } from "../../logging/formatLog";
import { getFilteredEvents, useActionLogStore } from "../../logging/actionLog";

const PLACEHOLDER_SCRIPT = `@ideas
  bubble b1 :: "Idea…"`;

export default function IdeasScriptPane() {
  const [view, setView] = useState<ScriptPaneView>("code");
  const [copied, setCopied] = useState(false);

  const logEvents = useActionLogStore((s) => s.events);
  const logVerbose = useActionLogStore((s) => s.verbose);
  const logCategoryFilter = useActionLogStore((s) => s.categoryFilter);
  const logSearchQuery = useActionLogStore((s) => s.searchQuery);

  const handleCopy = async () => {
    try {
      const text =
        view === "log"
          ? formatLogForCopy(
              getFilteredEvents(logEvents, {
                verbose: logVerbose,
                categoryFilter: logCategoryFilter,
                searchQuery: logSearchQuery,
              })
            )
          : PLACEHOLDER_SCRIPT;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignored */
    }
  };

  return (
    <div className="h-full flex flex-col border-t border-dark-accent/50 bg-dark-surface">
      <ScriptPaneHeader
        view={view}
        onViewChange={setView}
        statusSlot={
          view === "code" ? (
            <span className="text-xs text-dark-muted bg-dark-accent px-2 py-0.5 rounded">stub</span>
          ) : null
        }
        actionsSlot={
          <button
            type="button"
            onClick={handleCopy}
            className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        }
      />
      {view === "log" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <LogFeedView />
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden p-3 min-h-0">
          <textarea
            value={PLACEHOLDER_SCRIPT}
            readOnly
            className="w-full flex-1 px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm font-mono resize-none focus:outline-none focus:border-blue-500"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
