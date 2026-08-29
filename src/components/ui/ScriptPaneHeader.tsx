import ModeSwitchNavbar, { type ModeSwitchSlot } from "./ModeSwitchNavbar";

export type ScriptPaneView = "code" | "log";

const VIEW_LABELS: Record<ScriptPaneView, string> = {
  code: "Code",
  log: "Log",
};

interface ScriptPaneHeaderProps {
  views?: ScriptPaneView[];
  view: ScriptPaneView;
  onViewChange: (view: ScriptPaneView) => void;
  statusSlot?: React.ReactNode;
  actionsSlot?: React.ReactNode;
}

export default function ScriptPaneHeader({
  views = ["code", "log"],
  view,
  onViewChange,
  statusSlot,
  actionsSlot,
}: ScriptPaneHeaderProps) {
  const slots: ModeSwitchSlot[] = views.map((v) => ({
    id: v,
    label: VIEW_LABELS[v],
    active: view === v,
    onClick: () => onViewChange(v),
  }));

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-b border-dark-accent/50 shrink-0">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="text-xs font-medium text-dark-muted uppercase tracking-wide shrink-0">
          Script
        </span>
        {views.length > 0 && (
          <>
            <span className="text-dark-accent/50 shrink-0">|</span>
            <ModeSwitchNavbar slots={slots} />
          </>
        )}
        {statusSlot}
      </div>
      {actionsSlot ? <div className="flex items-center gap-2 shrink-0">{actionsSlot}</div> : null}
    </div>
  );
}
