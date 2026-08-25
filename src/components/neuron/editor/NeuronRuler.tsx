interface NeuronRulerProps {
  leftMargin: number;
  rightMargin: number;
  width: number;
  onMarginChange: (left: number, right: number) => void;
}

export default function NeuronRuler({
  leftMargin,
  rightMargin,
  width,
  onMarginChange,
}: NeuronRulerProps) {
  const contentWidth = Math.max(200, width - leftMargin - rightMargin);
  const ticks = Array.from({ length: Math.ceil(contentWidth / 40) + 1 }, (_, i) => i * 40);

  return (
    <div
      className="relative h-6 bg-dark-surface border-b border-dark-accent select-none shrink-0"
      style={{ paddingLeft: leftMargin, paddingRight: rightMargin }}
    >
      <div className="relative h-full">
        {ticks.map((x) => (
          <div
            key={x}
            className="absolute top-0 h-full border-l border-dark-accent/40"
            style={{ left: x }}
          >
            {x % 80 === 0 && (
              <span className="absolute top-0.5 left-1 text-[9px] text-dark-muted">{x / 8}</span>
            )}
          </div>
        ))}
        <div
          className="absolute top-0 w-1 h-full bg-blue-500/60 cursor-ew-resize"
          style={{ left: 0 }}
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startLeft = leftMargin;
            const onMove = (ev: MouseEvent) => {
              const delta = ev.clientX - startX;
              onMarginChange(Math.max(16, Math.min(width / 3, startLeft + delta)), rightMargin);
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
          title="Left margin"
        />
        <div
          className="absolute top-0 w-1 h-full bg-blue-500/60 cursor-ew-resize"
          style={{ right: 0 }}
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startRight = rightMargin;
            const onMove = (ev: MouseEvent) => {
              const delta = startX - ev.clientX;
              onMarginChange(leftMargin, Math.max(16, Math.min(width / 3, startRight + delta)));
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
          title="Right margin"
        />
      </div>
    </div>
  );
}
