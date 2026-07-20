import type { TimelineBeat, TimelineConnection, TimelineLane } from "./timelineTypes";

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

export function generateTimelineScript(
  lanes: TimelineLane[],
  beats: TimelineBeat[],
  connections: TimelineConnection[] = []
): string {
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
    if (beat.kind === "empty") {
      lines.push(`Beat ${beat.id} lane: ${beat.laneId} order: ${beat.order} empty: true`);
      continue;
    }
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

  if (connections.length > 0) {
    lines.push("");
    const sortedConnections = [...connections].sort((a, b) => a.id.localeCompare(b.id));
    for (const connection of sortedConnections) {
      const parts = [`Crossing ${connection.id} beats: ${connection.beatIds.join(",")}`];
      if (connection.title.trim()) {
        parts.push(`title: "${escapeQuoted(connection.title)}"`);
      }
      if (connection.description.trim()) {
        parts.push(`description: "${escapeQuoted(connection.description)}"`);
      }
      if (connection.date.trim()) {
        parts.push(`date: "${escapeQuoted(connection.date)}"`);
      }
      lines.push(parts.join(" "));
    }
  }

  lines.push("", "@timeline", "");
  return lines.join("\n");
}

export interface ParsedTimelineScript {
  lanes: TimelineLane[];
  beats: TimelineBeat[];
  connections: TimelineConnection[];
  errors: string[];
}

export function parseTimelineScript(text: string): ParsedTimelineScript {
  const lanes: TimelineLane[] = [];
  const beats: TimelineBeat[] = [];
  const connections: TimelineConnection[] = [];
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
      if (/empty:\s*true/.test(line)) {
        beats.push({
          id,
          laneId,
          order: Number.isFinite(order) ? order : 0,
          kind: "empty",
          title: "",
          description: "",
          date: "",
        });
        beatIds.add(id);
        continue;
      }
      const titleMatch = /title:\s*"((?:\\.|[^"\\])*)"/.exec(line);
      const title = titleMatch
        ? titleMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        : "Beat";
      beats.push({
        id,
        laneId,
        order: Number.isFinite(order) ? order : 0,
        kind: "story",
        title,
        description: kv.description ?? "",
        date: kv.date ?? "",
      });
      beatIds.add(id);
      continue;
    }

    if (line.startsWith("Crossing ")) {
      const idMatch = /^Crossing\s+(\S+)\s+/i.exec(line);
      if (!idMatch) {
        errors.push(`Invalid crossing line: ${line}`);
        continue;
      }
      const id = idMatch[1];
      const beatsMatch = /beats:\s*(\S+)/.exec(line);
      if (!beatsMatch) {
        errors.push(`Crossing ${id} missing beats: beat references`);
        continue;
      }
      const beatIdsList = beatsMatch[1].split(",").filter(Boolean);
      if (beatIdsList.length < 2) {
        errors.push(`Crossing ${id} requires at least 2 beat ids`);
        continue;
      }
      const kv = parseKeyValueRest(line);
      connections.push({
        id,
        beatIds: beatIdsList,
        title: kv.title ?? "",
        description: kv.description ?? "",
        date: kv.date ?? "",
      });
    }
  }

  for (const beat of beats) {
    if (!laneIds.has(beat.laneId)) {
      errors.push(`Beat ${beat.id} references unknown lane ${beat.laneId}`);
    }
  }

  for (const connection of connections) {
    for (const beatId of connection.beatIds) {
      if (!beatIds.has(beatId)) {
        errors.push(`Crossing ${connection.id} references unknown beat ${beatId}`);
      }
    }
  }

  return { lanes, beats, connections, errors };
}

export function lineReferencesTimelineEntity(line: string, entityId: string): boolean {
  const idEscaped = entityId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idRe = new RegExp(`(?:^|[^a-zA-Z0-9_])${idEscaped}(?:$|[^a-zA-Z0-9_])`);
  return idRe.test(line);
}
