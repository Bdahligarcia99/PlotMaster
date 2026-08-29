import { useState } from "react";
import ScriptPaneHeader from "../ui/ScriptPaneHeader";
import LogFeedView from "../logging/LogFeedView";
import { formatLogForCopy } from "../../logging/formatLog";
import { getFilteredEvents, useActionLogStore } from "../../logging/actionLog";

export default function NeuronLogPane() {
  const [copied, setCopied] = useState(false);

  const logEvents = useActionLogStore((s) => s.events);
  const logVerbose = useActionLogStore((s) => s.verbose);
  const logCategoryFilter = useActionLogStore((s) => s.categoryFilter);
  const logSearchQuery = useActionLogStore((s) => s.searchQuery);

  const handleCopy = async () => {
    try {
      const text = formatLogForCopy(
        getFilteredEvents(logEvents, {
          verbose: logVerbose,
          categoryFilter: logCategoryFilter,
          searchQuery: logSearchQuery,
        })
      );
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
        views={["log"]}
        view="log"
        onViewChange={() => {}}
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
      <div className="flex-1 min-h-0 overflow-hidden">
        <LogFeedView />
      </div>
    </div>
  );
}
