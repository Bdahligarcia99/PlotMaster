import type { TimelineBeat, TimelineLane } from "./timelineTypes";

function escapeQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseQuotedString(input: string, start: number): { value: string; end: number } | null {
  if (input[start] !== '"') return null;
  let i = start + 1;
  let value = "";
  while (i < input.length) {
    const ch = input[i];
    if (ch === "\\") {
      value += input[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (ch === '"') {
      return { value, end: i + 1 };
    }
    value += ch;
    i++;
  }
  return null;
}

function parseKeyValueRest(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+):\s*"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    out[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return out;
}

export function generateTimelineScript(lanes: TimelineLane[], beats: TimelineBeat[]): string {
  const lines: string[] = ["@declarations", ""];
  const sortedLanes = [...lanes].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const lane of sortedLanes) {
    lines.push(
      `Lane ${lane.id} "${escapeQuoted(lane.label)}" type: ${lane.laneType} sort: ${lane.sortOrder}`
    );
  }

  if (sortedLanes.length > 0) lines.push("");

  const sortedBeats = [...beats].sort((a, b) => {
    if (a.laneId !== b.laneId) return a.laneId.localeCompare(b.laneId);
    return a.order - b.order;
  });

  for (const beat of sortedBeats) {
    const parts = [
      `Beat ${beat.id} lane: ${beat.laneId} order: ${beat.order}`,
      `title: "${escapeQuoted(beat.title)}"`,
    ];
    if (beat.description.trim()) {
      parts.push(`description: "${escapeQuoted(beat.description)}"`);
    }
    if (beat.date.trim()) {
      parts.push(`date: "${escapeQuoted(beat.date)}"`);
    }
    lines.push(parts.join(" "));
  }

  lines.push("", "@timeline", "");
  return lines.join("\n");
}

export interface ParsedTimelineScript {
  lanes: TimelineLane[];
  beats: TimelineBeat[];
  errors: string[];
}

export function parseTimelineScript(text: string): ParsedTimelineScript {
  const lanes: TimelineLane[] = [];
  const beats: TimelineBeat[] = [];
  const errors: string[] = [];
  const laneIds = new Set<string>();
  const beatIds = new Set<string>();

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("@")) continue;

    if (line.startsWith("Lane ")) {
      const idMatch = /^Lane\s+(\S+)\s+/i.exec(line);
      if (!idMatch) {
        errors.push(`Invalid lane line: ${line}`);
        continue;
      }
      const id = idMatch[1];
      const afterId = line.slice(idMatch[0].length);
      const labelMatch = parseQuotedString(afterId, afterId.indexOf('"'));
      const label = labelMatch?.value ?? "Lane";
      const kv = parseKeyValueRest(line);
      const sortOrder = Number.parseInt(kv.sort ?? String(lanes.length), 10);
      const laneType = kv.type ?? "character";
      lanes.push({
        id,
        label,
        laneType,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : lanes.length,
      });
      laneIds.add(id);
      continue;
    }

    if (line.startsWith("Beat ")) {
      const idMatch = /^Beat\s+(\S+)\s+/i.exec(line);
      if (!idMatch) {
        errors.push(`Invalid beat line: ${line}`);
        continue;
      }
      const id = idMatch[1];
      const kv = parseKeyValueRest(line);
      const laneId = kv.lane;
      if (!laneId) {
        errors.push(`Beat ${id} missing lane:`);
        continue;
      }
      const order = Number.parseInt(kv.order ?? "0", 10);
      const titleMatch = /title:\s*"((?:\\.|[^"\\])*)"/.exec(line);
      const title = titleMatch
        ? titleMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        : "Beat";
      beats.push({
        id,
        laneId,
        order: Number.isFinite(order) ? order : 0,
        title,
        description: kv.description ?? "",
        date: kv.date ?? "",
      });
      beatIds.add(id);
    }
  }

  for (const beat of beats) {
    if (!laneIds.has(beat.laneId)) {
      errors.push(`Beat ${beat.id} references unknown lane ${beat.laneId}`);
    }
  }

  return { lanes, beats, errors };
}

export function lineReferencesTimelineEntity(line: string, entityId: string): boolean {
  const idEscaped = entityId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idRe = new RegExp(`(?:^|[^a-zA-Z0-9_])${idEscaped}(?:$|[^a-zA-Z0-9_])`);
  return idRe.test(line);
}
