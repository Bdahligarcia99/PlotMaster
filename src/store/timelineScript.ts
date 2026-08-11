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

/** Reads an unquoted token field like `lane: abc123` or `type: character`. */
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
  const mode = spec.mode ?? "none";
  parts.push(`dateMode: ${mode}`);
  if (mode === "none") return;
  if (mode === "label") {
    parts.push(`dateLabel: "${escapeQuoted(spec.label ?? "")}"`);
    return;
  }
  if (mode === "resolved") {
    parts.push(`dateResolved: "${escapeQuoted(spec.resolved ?? "")}"`);
    return;
  }
  if (mode === "absolute") {
    parts.push(`dateAbsolute: ${spec.absolute ?? ""}`);
    return;
  }
  if (mode === "relative") {
    const r = spec.relative ?? { years: 0, months: 0, days: 0, originBeatId: "" };
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
  if (modeRaw === "resolved") {
    return { mode: "resolved", resolved: kv.dateResolved ?? kv.date ?? "" };
  }
  if (kv.date?.trim()) {
    return migrateLegacyDateString(kv.date);
  }
  return emptyBeatDateSpec();
}

function beatFieldLines(beat: TimelineBeat): string[] {
  const fieldLines: string[] = [
    `      title: "${escapeQuoted(beat.title)}"`,
    `      synopsis: "${escapeQuoted(beat.synopsis)}"`,
    `      detail: "${escapeQuoted(beat.detail)}"`,
  ];
  const dateParts: string[] = [];
  appendBeatDateParts(dateParts, beat.dateSpec);
  for (const part of dateParts) {
    fieldLines.push(`      ${part}`);
  }
  return fieldLines;
}

function beatHeaderLine(beat: TimelineBeat): string {
  const headerParts = [`    Beat ${beat.id} slot: ${beat.slot}`];
  if (beat.kind === "anchor") {
    headerParts.push("kind: anchor");
  }
  return `${headerParts.join(" ")} {`;
}

export interface GenerateTimelineScriptOptions {
  includeSectionMarkers?: boolean;
}

export function generateTimelineScript(
  lanes: TimelineLane[],
  beats: TimelineBeat[],
  connections: TimelineConnection[] = [],
  options: GenerateTimelineScriptOptions = {}
): string {
  const includeSectionMarkers = options.includeSectionMarkers !== false;
  const lines: string[] = includeSectionMarkers ? ["@declarations", ""] : [];
  const sortedLanes = [...lanes].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const lane of sortedLanes) {
    const laneParts = [
      `Lane ${lane.id} "${escapeQuoted(lane.label)}" type: ${lane.laneType} sort: ${lane.sortOrder}`,
    ];
    if (lane.color?.trim()) {
      laneParts.push(`color: "${escapeQuoted(lane.color.trim())}"`);
    }
    lines.push(`${laneParts.join(" ")} {`);

    const laneBeats = beats
      .filter((b) => b.laneId === lane.id)
      .sort((a, b) => a.slot - b.slot);

    lines.push("  beats: [");
    for (let i = 0; i < laneBeats.length; i++) {
      const beat = laneBeats[i];
      lines.push(beatHeaderLine(beat));
      lines.push(...beatFieldLines(beat));
      lines.push("    }" + (i < laneBeats.length - 1 ? "," : ""));
    }
    lines.push("  ]");
    lines.push("}");
    lines.push("");
  }

  if (connections.length > 0) {
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
    lines.push("");
  }

  if (includeSectionMarkers) {
    lines.push("@timeline", "");
  }
  return lines.join("\n");
}

/** Snippet to insert at cursor inside a Lane beats array. */
export function getEmptyBeatScriptBlock(beatId: string, slot = 0): string {
  return `    Beat ${beatId} slot: ${slot} {
      title: ""
      synopsis: ""
      detail: ""
      dateMode: none
    }`;
}

export interface ParsedTimelineScript {
  lanes: TimelineLane[];
  beats: TimelineBeat[];
  connections: TimelineConnection[];
  errors: string[];
}

function parseLaneHeader(line: string): Omit<TimelineLane, "sortOrder"> & { sortOrder: number } | null {
  const idMatch = /^Lane\s+(\S+)\s+/i.exec(line);
  if (!idMatch) return null;
  const id = idMatch[1];
  const afterId = line.slice(idMatch[0].length);
  const labelMatch = parseQuotedString(afterId, afterId.indexOf('"'));
  const label = labelMatch?.value ?? "Lane";
  const sortOrder = parseNumericField(line, "sort") ?? 0;
  const laneType = parseBareField(line, "type") ?? "character";
  const colorKv = parseKeyValueRest(line);
  const color = colorKv.color?.trim() || undefined;
  return {
    id,
    label,
    laneType,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    color,
  };
}

function parseBeatDeclaration(
  header: string,
  blockBody: string,
  laneId: string,
  errors: string[]
): TimelineBeat | null {
  const idMatch = /^Beat\s+(\S+)\s+/i.exec(header);
  if (!idMatch) {
    errors.push(`Invalid beat line: ${header}`);
    return null;
  }
  const id = idMatch[1];
  const fullLine = blockBody ? `${header} ${blockBody}` : header;
  const kv = parseKeyValueRest(fullLine);
  const explicitLaneId = parseBareField(fullLine, "lane");
  const resolvedLaneId = explicitLaneId ?? laneId;
  if (!resolvedLaneId) {
    errors.push(`Beat ${id} missing lane:`);
    return null;
  }
  const slot = parseNumericField(fullLine, "slot") ?? parseNumericField(fullLine, "order") ?? 0;
  if (/kind:\s*anchor/i.test(fullLine)) {
    const titleMatch = /title:\s*"((?:\\.|[^"\\])*)"/.exec(fullLine);
    const title = titleMatch
      ? titleMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
      : "Beat";
    return {
      id,
      laneId: resolvedLaneId,
      slot: Number.isFinite(slot) ? slot : 0,
      kind: "anchor",
      title,
      synopsis: kv.synopsis ?? "",
      detail: kv.detail ?? kv.description ?? "",
      dateSpec: parseBeatDateSpec(fullLine, kv),
    };
  }
  if (/kind:\s*empty/i.test(fullLine) || /empty:\s*true/.test(fullLine)) {
    return null;
  }
  const titleMatch = /title:\s*"((?:\\.|[^"\\])*)"/.exec(fullLine);
  const title = titleMatch
    ? titleMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
    : "Beat";
  return {
    id,
    laneId: resolvedLaneId,
    slot: Number.isFinite(slot) ? slot : 0,
    kind: "story",
    title,
    synopsis: kv.synopsis ?? "",
    detail: kv.detail ?? kv.description ?? "",
    dateSpec: parseBeatDateSpec(fullLine, kv),
  };
}

function parseBeatBlockFromLines(
  rawLines: string[],
  startIndex: number,
  laneId: string,
  errors: string[]
): { beat: TimelineBeat | null; nextIndex: number } {
  let lineIndex = startIndex;
  let header = rawLines[lineIndex]?.trim() ?? "";
  lineIndex++;
  if (!header.startsWith("Beat ")) {
    return { beat: null, nextIndex: lineIndex };
  }

  let blockBody = "";
  if (header.endsWith("{")) {
    header = header.slice(0, -1).trim();
    const bodyLines: string[] = [];
    while (lineIndex < rawLines.length) {
      const innerLine = rawLines[lineIndex].trim().replace(/,$/, "");
      lineIndex++;
      if (innerLine === "}" || innerLine === "},") break;
      if (innerLine) bodyLines.push(innerLine);
    }
    blockBody = bodyLines.join(" ");
  }

  const beat = parseBeatDeclaration(header, blockBody, laneId, errors);
  return { beat, nextIndex: lineIndex };
}

function parseNestedLaneBlock(
  rawLines: string[],
  startIndex: number,
  headerLine: string,
  errors: string[]
): { lane: TimelineLane; beats: TimelineBeat[]; nextIndex: number } | null {
  const laneHeader = parseLaneHeader(headerLine.replace(/\{$/, "").trim());
  if (!laneHeader) {
    errors.push(`Invalid lane line: ${headerLine}`);
    return null;
  }

  const lane: TimelineLane = {
    id: laneHeader.id,
    label: laneHeader.label,
    laneType: laneHeader.laneType,
    sortOrder: laneHeader.sortOrder,
    color: laneHeader.color,
  };
  const beats: TimelineBeat[] = [];
  let lineIndex = startIndex;

  while (lineIndex < rawLines.length) {
    const line = rawLines[lineIndex].trim();
    lineIndex++;
    if (!line || line.startsWith("#")) continue;
    if (line === "}" || line === "},") break;

    if (/^beats:\s*\[/.test(line)) {
      while (lineIndex < rawLines.length) {
        const inner = rawLines[lineIndex].trim();
        if (inner === "]" || inner === "],") {
          lineIndex++;
          break;
        }
        if (inner.startsWith("Beat ")) {
          const result = parseBeatBlockFromLines(rawLines, lineIndex - 1, lane.id, errors);
          if (result.beat) beats.push(result.beat);
          lineIndex = result.nextIndex;
          continue;
        }
        lineIndex++;
      }
      continue;
    }

    if (line.startsWith("Beat ")) {
      const result = parseBeatBlockFromLines(rawLines, lineIndex - 1, lane.id, errors);
      if (result.beat) beats.push(result.beat);
      lineIndex = result.nextIndex;
    }
  }

  return { lane, beats, nextIndex: lineIndex };
}

export function parseTimelineScript(text: string): ParsedTimelineScript {
  const lanes: TimelineLane[] = [];
  const beats: TimelineBeat[] = [];
  const connections: TimelineConnection[] = [];
  const errors: string[] = [];
  const laneIds = new Set<string>();
  const beatIds = new Set<string>();

  const rawLines = text.split("\n");
  let lineIndex = 0;
  while (lineIndex < rawLines.length) {
    const line = rawLines[lineIndex].trim();
    lineIndex++;
    if (!line || line.startsWith("#") || line.startsWith("@")) continue;

    if (line.startsWith("Lane ")) {
      if (line.endsWith("{")) {
        const nested = parseNestedLaneBlock(rawLines, lineIndex, line, errors);
        if (nested) {
          if (laneIds.has(nested.lane.id)) {
            errors.push(`Duplicate lane id ${nested.lane.id}`);
          } else {
            lanes.push({ ...nested.lane, sortOrder: nested.lane.sortOrder ?? lanes.length });
            laneIds.add(nested.lane.id);
          }
          for (const beat of nested.beats) {
            if (beatIds.has(beat.id)) {
              errors.push(`Duplicate beat id ${beat.id}`);
            } else {
              beats.push(beat);
              beatIds.add(beat.id);
            }
          }
          lineIndex = nested.nextIndex;
        }
        continue;
      }

      const laneHeader = parseLaneHeader(line);
      if (!laneHeader) {
        errors.push(`Invalid lane line: ${line}`);
        continue;
      }
      if (laneIds.has(laneHeader.id)) {
        errors.push(`Duplicate lane id ${laneHeader.id}`);
      } else {
        lanes.push({
          ...laneHeader,
          sortOrder: Number.isFinite(laneHeader.sortOrder) ? laneHeader.sortOrder : lanes.length,
        });
        laneIds.add(laneHeader.id);
      }
      continue;
    }

    if (line.startsWith("Beat ")) {
      let header = line;
      let blockBody = "";
      if (header.endsWith("{")) {
        header = header.slice(0, -1).trim();
        const bodyLines: string[] = [];
        while (lineIndex < rawLines.length) {
          const innerLine = rawLines[lineIndex].trim();
          lineIndex++;
          if (innerLine === "}") break;
          if (innerLine) bodyLines.push(innerLine);
        }
        blockBody = bodyLines.join(" ");
      }
      const beat = parseBeatDeclaration(header, blockBody, "", errors);
      if (beat) {
        if (beatIds.has(beat.id)) {
          errors.push(`Duplicate beat id ${beat.id}`);
        } else {
          beats.push(beat);
          beatIds.add(beat.id);
        }
      }
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

const LANE_LINE_QUOTED = /^(\s*Lane\s+\S+[^"{]*?)"((?:\\.|[^"\\])+)"/;
const KV_QUOTED = /(\w+):\s*"((?:\\.|[^"\\])+)"/g;

/** Replace non-empty quoted field values with "..." for compact script display. */
export function compactTimelineScriptDisplay(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("@") || trimmed.startsWith("#")) return line;

      let result = line.replace(LANE_LINE_QUOTED, '$1"..."');
      result = result.replace(KV_QUOTED, '$1: "..."');
      return result;
    })
    .join("\n");
}
