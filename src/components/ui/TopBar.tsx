interface TopBarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
}

export default function TopBar({ left, right, children }: TopBarProps) {
  return (
    <div className="relative z-40 flex-shrink-0 bg-dark-surface border-b border-dark-accent/50">
      <div className="relative flex items-center justify-between px-4 py-3">
        {left && <div className="flex items-center gap-4">{left}</div>}
        {children && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto">{children}</div>
          </div>
        )}
        {right && <div className="flex items-center gap-2 ml-auto">{right}</div>}
      </div>
    </div>
  );
}
