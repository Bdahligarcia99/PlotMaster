const PLACEHOLDER_SCRIPT = `@declare
  [Scene1]
  [CharacterA]

@timeline
  # Lanes and anchors (stub)`;

export default function TimelineScriptPane() {
  return (
    <div className="h-full flex flex-col border-t border-dark-accent/50 bg-dark-surface">
      <div className="h-1.5 flex items-center justify-center bg-dark-accent/30 cursor-ns-resize">
        <div className="w-8 h-0.5 rounded-full bg-dark-muted/50" />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
            Script
          </h2>
          <span className="text-xs text-dark-muted bg-dark-accent px-2 py-0.5 rounded">
            stub
          </span>
        </div>
        <textarea
          value={PLACEHOLDER_SCRIPT}
          readOnly
          className="w-full flex-1 px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm font-mono resize-none focus:outline-none focus:border-blue-500"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
