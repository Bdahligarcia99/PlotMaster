const PLACEHOLDER_ENTITIES = ["New Person", "Andrea", "Nora"];

export default function FamilyTreeLeftSidebar() {
  return (
    <div className="w-[260px] flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden">
      <div className="p-4 border-b border-dark-accent/50">
        <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
          Entities
        </h2>
        <p className="text-dark-muted text-xs mt-1">Names in this tree (stub)</p>
      </div>
      <div className="p-3 border-b border-dark-accent/50">
        <input
          type="text"
          placeholder="Search..."
          className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm placeholder-dark-muted focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          readOnly
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {PLACEHOLDER_ENTITIES.length === 0 ? (
          <p className="text-dark-muted text-sm py-4 text-center">No entities yet.</p>
        ) : (
          <div className="space-y-1">
            {PLACEHOLDER_ENTITIES.map((name, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-xl border border-dark-accent/30 hover:bg-dark-accent/30 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-dark-accent flex-shrink-0" />
                <span className="text-dark-text text-sm flex-1 truncate">{name}</span>
                <svg
                  className="w-4 h-4 text-dark-muted flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
