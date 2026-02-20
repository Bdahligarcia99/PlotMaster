interface TopBarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
}

export default function TopBar({ left, right, children }: TopBarProps) {
  return (
    <div className="flex-shrink-0 bg-dark-surface border-b border-dark-accent/50">
      <div className="flex items-center justify-between px-4 py-3">
        {left && <div className="flex items-center gap-4">{left}</div>}
        {children && <div className="flex-1">{children}</div>}
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
    </div>
  );
}
