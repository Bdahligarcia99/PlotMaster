import type { BeatDateSpec, TimelineBeat, TimelineConnection, TimelineLane } from "./timelineTypes";
import { emptyBeatDateSpec, migrateLegacyDateString } from "../utils/beatDate";

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

/** Reads an unquoted token field like `lane: abc123` or `type: character`. `parseKeyValueRest`
 * only matches quoted string values, so bare (unquoted) fields need their own lookup. */
function parseBareField(line: string, key: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${key}:\\s*(\\S+)`).exec(line);
  return match ? match[1] : undefined;
}

/** Reads an unquoted numeric field like `slot: 3` or `sort: -1`. */
function parseNumericField(line: string, key: string): number | undefined {
  const match = new RegExp(`(?:^|\\s)${key}:\\s*(-?\\d+)`).exec(line);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function appendBeatDateParts(parts: string[], spec: BeatDateSpec): void {
  if (spec.mode === "none") return;
  parts.push(`dateMode: ${spec.mode}`);
  if (spec.mode === "label" && spec.label?.trim()) {
    parts.push(`dateLabel: "${escapeQuoted(spec.label.trim())}"`);
  }
  if (spec.mode === "absolute" && spec.absolute?.trim()) {
    parts.push(`dateAbsolute: ${spec.absolute.trim()}`);
  }
  if (spec.mode === "relative" && spec.relative) {
    const r = spec.relative;
    parts.push(
      `dateRelative: ${r.years}y ${r.months}m ${r.days}d origin: ${r.originBeatId}`
    );
  }
}

function parseBeatDateSpec(line: string, kv: Record<string, string>): BeatDateSpec {
  const modeRaw = parseBareField(line, "dateMode");
  if (modeRaw === "none") {
    return emptyBeatDateSpec();
  }
  if (modeRaw === "absolute") {
    const absolute = parseBareField(line, "dateAbsolute") ?? kv.dateAbsolute ?? "";
    return absolute ? { mode: "absolute", absolute } : emptyBeatDateSpec();
  }
  if (modeRaw === "relative") {
    const relMatch = /dateRelative:\s*(-?\d+)y\s*(-?\d+)m\s*(-?\d+)d\s+origin:\s*(\S+)/i.exec(line);
    if (relMatch) {
      return {
        mode: "relative",
        relative: {
          years: Number.parseInt(relMatch[1], 10) || 0,
          months: Number.parseInt(relMatch[2], 10) || 0,
          days: Number.parseInt(relMatch[3], 10) || 0,
          originBeatId: relMatch[4],
        },
      };
    }
    return emptyBeatDateSpec();
  }
  if (modeRaw === "label") {
    return { mode: "label", label: kv.dateLabel ?? kv.date ?? "" };
  }
  if (kv.date?.trim()) {
    return migrateLegacyDateString(kv.date);
  }
  return emptyBeatDateSpec();
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
    return a.slot - b.slot;
  });

  for (const beat of sortedBeats) {
    if (beat.kind === "anchor") {
      const parts = [
        `Beat ${beat.id} lane: ${beat.laneId} slot: ${beat.slot}`,
        "kind: anchor",
        `title: "${escapeQuoted(beat.title)}"`,
      ];
      if (beat.synopsis.trim()) {
        parts.push(`synopsis: "${escapeQuoted(beat.synopsis)}"`);
      }
      if (beat.detail.trim()) {
        parts.push(`detail: "${escapeQuoted(beat.detail)}"`);
      }
      appendBeatDateParts(parts, beat.dateSpec);
      lines.push(parts.join(" "));
      continue;
    }
    const parts = [
      `Beat ${beat.id} lane: ${beat.laneId} slot: ${beat.slot}`,
      `title: "${escapeQuoted(beat.title)}"`,
    ];
    if (beat.synopsis.trim()) {
      parts.push(`synopsis: "${escapeQuoted(beat.synopsis)}"`);
    }
    if (beat.detail.trim()) {
      parts.push(`detail: "${escapeQuoted(beat.detail)}"`);
    }
    appendBeatDateParts(parts, beat.dateSpec);
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
      const sortOrder = parseNumericField(line, "sort") ?? lanes.length;
      const laneType = parseBareField(line, "type") ?? "character";
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
      const laneId = parseBareField(line, "lane");
      if (!laneId) {
        errors.push(`Beat ${id} missing lane:`);
        continue;
      }
      // Accept the legacy `order:` key too, so scripts saved before the slot-grid rewrite still parse.
      const slot = parseNumericField(line, "slot") ?? parseNumericField(line, "order") ?? 0;
      if (/kind:\s*anchor/i.test(line)) {
        const titleMatch = /title:\s*"((?:\\.|[^"\\])*)"/.exec(line);
        const title = titleMatch
          ? titleMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
          : "Beat";
        beats.push({
          id,
          laneId,
          slot: Number.isFinite(slot) ? slot : 0,
          kind: "anchor",
          title,
          synopsis: kv.synopsis ?? "",
          detail: kv.detail ?? kv.description ?? "",
          dateSpec: parseBeatDateSpec(line, kv),
        });
        beatIds.add(id);
        continue;
      }
      // Legacy "kind: empty" spacer beats are silently dropped — the slot grid represents gaps
      // natively now, so a line like this simply no longer produces a beat.
      if (/kind:\s*empty/i.test(line) || /empty:\s*true/.test(line)) {
        continue;
      }
      const titleMatch = /title:\s*"((?:\\.|[^"\\])*)"/.exec(line);
      const title = titleMatch
        ? titleMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        : "Beat";
      beats.push({
        id,
        laneId,
        slot: Number.isFinite(slot) ? slot : 0,
        kind: "story",
        title,
        synopsis: kv.synopsis ?? "",
        detail: kv.detail ?? kv.description ?? "",
        dateSpec: parseBeatDateSpec(line, kv),
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
