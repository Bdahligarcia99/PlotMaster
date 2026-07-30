/** Fixed-width module label badge so TopBar layout does not shift between modules. */
export default function ModuleBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[132px] text-xs text-dark-muted bg-dark-accent px-2 py-0.5 rounded">
      {label}
    </span>
  );
}
