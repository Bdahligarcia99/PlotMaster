import type { LogEvent } from "./actionLog";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

export function formatLogLine(event: LogEvent, prevTs?: number): string {
  const delta =
    prevTs != null ? ` +${Math.max(0, event.t - prevTs)}ms` : "";
  const tier = event.tier === "error" ? "ERROR" : event.tier === "action" ? "ACTION" : "VERBOSE";
  const repeat = event.repeat && event.repeat > 1 ? ` (×${event.repeat})` : "";
  const dur = event.durationMs != null ? ` [${event.durationMs}ms]` : "";
  const detail = event.detail ? `  ${event.detail}` : "";
  return `[${formatTime(event.t)}]${delta}  ${tier.padEnd(7)}  ${event.module.padEnd(11)}  ${event.category.padEnd(10)}  ${event.label}${repeat}${dur}${detail}`;
}

export function formatLogForCopy(events: LogEvent[]): string {
  if (events.length === 0) return "";
  const lines: string[] = [];
  let prevTs: number | undefined;
  for (const e of events) {
    lines.push(formatLogLine(e, prevTs));
    if (e.payload !== undefined) {
      try {
        lines.push(`  payload: ${JSON.stringify(e.payload)}`);
      } catch {
        lines.push("  payload: [unserializable]");
      }
    }
    prevTs = e.t;
  }
  return lines.join("\n");
}

export const LOG_CATEGORY_LABELS: Record<string, string> = {
  node: "Node",
  union: "Union",
  person: "Person",
  selection: "Selection",
  document: "Document",
  family: "Family",
  layout: "Layout",
  ui: "UI",
  navigation: "Nav",
  persistence: "Save",
  error: "Error",
};
