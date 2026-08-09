export default function ChartsInspector() {
  return (
    <div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto">
      <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide mb-3">
        Inspector
      </h3>
      <p className="text-dark-muted text-xs mb-3">Selected entity details</p>
      <div className="space-y-3">
        <div>
          <label className="block text-dark-muted text-sm mb-1">Name</label>
          <div className="px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm">
            —
          </div>
        </div>
        <div>
          <label className="block text-dark-muted text-sm mb-1">Backstory</label>
          <div className="px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm min-h-[60px]">
            —
          </div>
        </div>
        <div>
          <label className="block text-dark-muted text-sm mb-1">Labels</label>
          <div className="px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm min-h-[60px]">
            —
          </div>
        </div>
      </div>
    </div>
  );
}
