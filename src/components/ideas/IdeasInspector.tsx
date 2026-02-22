export default function IdeasInspector() {
  return (
    <div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto">
      <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide mb-3">
        Inspector
      </h3>
      <div className="space-y-3">
        <div>
          <label className="block text-dark-muted text-sm mb-1">Title</label>
          <div className="px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm">
            —
          </div>
        </div>
        <div>
          <label className="block text-dark-muted text-sm mb-1">Notes</label>
          <div className="px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm min-h-[80px]">
            —
          </div>
        </div>
      </div>
      <p className="text-dark-muted text-xs mt-3">Select a bubble to edit.</p>
    </div>
  );
}
