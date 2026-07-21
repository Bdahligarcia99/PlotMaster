import type { BeatDateSpec } from "../../../store/timelineTypes";
import { dateSpecFromImportText, emptyBeatDateSpec } from "../../../utils/beatDate";

export const SEPARATOR_LINE = "- - - - - -";
export const FIELD_LABELS = ["Title:", "Synopsis:", "Detail:", "Date:"] as const;
export type BeatFieldKey = "title" | "synopsis" | "detail" | "date";

export interface BeatSegmentFields {
  title: string;
  synopsis: string;
  detail: string;
  dateText: string;
  dateSpec: BeatDateSpec;
}

export interface BeatSegment {
  id: string;
  start: number;
  end: number;
  rawText: string;
  fields: BeatSegmentFields;
}

const MONTH =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

const DATE_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:${MONTH})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s+|\\s+)\\d{1,4}\\b`, "i"),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH})(?:,\\s+|\\s+)\\d{1,4}\\b`, "i"),
  /\b\d{4}-\d{1,2}-\d{1,2}\b/,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
];

export function isSeparatorLine(line: string): boolean {
  return /^-{3,}\s*$/.test(line.trim()) || line.trim() === SEPARATOR_LINE;
}

export function isBoundaryLine(line: string): boolean {
  return line.trim() === "" || isSeparatorLine(line);
}

export function isFieldLabelLine(line: string): BeatFieldKey | null {
  const trimmed = line.trim();
  if (/^Title:\s*/i.test(trimmed)) return "title";
  if (/^Synopsis:\s*/i.test(trimmed)) return "synopsis";
  if (/^Detail:\s*/i.test(trimmed)) return "detail";
  if (/^Date:\s*/i.test(trimmed)) return "date";
  return null;
}

export function stripPrefixes(text: string, prefixes: string[]): string {
  if (prefixes.length === 0) return text;
  const lines = text.split("\n");
  const stripped = lines.map((line) => {
    for (const prefix of prefixes) {
      const normalized = prefix.trim();
      if (!normalized) continue;
      const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^\\s*${escaped}\\s*:?\\s*`, "i");
      if (re.test(line)) {
        return line.replace(re, "");
      }
    }
    return line;
  });
  return stripped.join("\n");
}

export function detectDate(text: string): string {
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return "";
}

export function lineStartOffset(lines: string[], lineIndex: number): number {
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) {
    offset += lines[i].length + 1;
  }
  return offset;
}

export function scanCommittedSeparators(text: string): boolean {
  return text.split("\n").some((line) => isSeparatorLine(line));
}

export function findSeparatorLineIndices(text: string): number[] {
  const lines = text.split("\n");
  const indices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isSeparatorLine(lines[i])) {
      indices.push(i);
    }
  }
  return indices;
}

/** Insert dash-line separators at blank-line gaps in pasted text. */
export function insertAutoSeparatorsInText(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (i < lines.length - 1 && lines[i].trim() !== "" && lines[i + 1].trim() === "") {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && lines[j].trim() !== "") {
        out.push(SEPARATOR_LINE);
        i = j - 1;
      }
    }
  }
  return out.join("\n");
}

export function getTemplateBlock(): string {
  return `Title: 
Synopsis: 
Detail: 
Date: 
${SEPARATOR_LINE}
`;
}

export interface FieldDisableFlags {
  synopsis: boolean;
  detail: boolean;
  date: boolean;
}

export function deriveAutoFields(
  rawText: string,
  disabled: FieldDisableFlags
): BeatSegmentFields {
  const lines = rawText.split("\n");
  const title = (lines[0] ?? "").trim();
  const remaining = lines.slice(1).join("\n").trim();
  const date = disabled.date ? "" : detectDate(rawText);
  const detail = disabled.detail ? "" : remaining;
  const dateSpec = date.trim() ? dateSpecFromImportText(date) : emptyBeatDateSpec();
  return {
    title,
    synopsis: "",
    detail,
    dateText: date,
    dateSpec,
  };
}

export function parseFieldLabelValue(line: string, field: BeatFieldKey): string {
  const prefixes: Record<BeatFieldKey, RegExp> = {
    title: /^Title:\s*/i,
    synopsis: /^Synopsis:\s*/i,
    detail: /^Detail:\s*/i,
    date: /^Date:\s*/i,
  };
  return line.replace(prefixes[field], "").trim();
}

export function parseSegmentFields(rawText: string): BeatSegmentFields {
  const lines = rawText.split("\n");
  const fields: BeatSegmentFields = {
    title: "",
    synopsis: "",
    detail: "",
    dateText: "",
    dateSpec: emptyBeatDateSpec(),
  };

  let hasLabels = false;
  for (const line of lines) {
    const key = isFieldLabelLine(line);
    if (key) {
      hasLabels = true;
      const val = parseFieldLabelValue(line, key);
      if (key === "title") fields.title = val;
      else if (key === "synopsis") fields.synopsis = val;
      else if (key === "detail") fields.detail = val;
      else if (key === "date") {
        fields.dateText = val;
        fields.dateSpec = val.trim() ? dateSpecFromImportText(val) : emptyBeatDateSpec();
      }
    }
  }

  if (!hasLabels) {
    return deriveAutoFields(rawText, { synopsis: false, detail: false, date: false });
  }
  return fields;
}

export function extractSegments(text: string): BeatSegment[] {
  const lines = text.split("\n");
  const segments: BeatSegment[] = [];
  let contentStart = -1;
  let segIndex = 0;

  const flush = (endLine: number) => {
    if (contentStart < 0) return;
    const rawText = lines.slice(contentStart, endLine).join("\n");
    if (rawText.trim()) {
      const start = lineStartOffset(lines, contentStart);
      const end = lineStartOffset(lines, endLine);
      segments.push({
        id: `seg-${segIndex++}`,
        start,
        end,
        rawText,
        fields: parseSegmentFields(rawText),
      });
    }
    contentStart = -1;
  };

  for (let i = 0; i < lines.length; i++) {
    if (isSeparatorLine(lines[i])) {
      flush(i);
    } else if (contentStart < 0 && lines[i].trim() !== "") {
      contentStart = i;
    }
  }
  flush(lines.length);

  return segments;
}

export function formatFieldLine(field: BeatFieldKey, value: string): string {
  const labels: Record<BeatFieldKey, string> = {
    title: "Title:",
    synopsis: "Synopsis:",
    detail: "Detail:",
    date: "Date:",
  };
  return `${labels[field]} ${value}`;
}

export function applyAutoLabelsToSegment(
  segmentText: string,
  disabled: FieldDisableFlags,
  prefixes: string[]
): string {
  const stripped = stripPrefixes(segmentText, prefixes);
  const auto = deriveAutoFields(stripped, disabled);
  const lines: string[] = [];
  lines.push(formatFieldLine("title", auto.title));
  if (!disabled.synopsis && auto.synopsis) {
    lines.push(formatFieldLine("synopsis", auto.synopsis));
  }
  if (!disabled.detail && auto.detail) {
    lines.push(formatFieldLine("detail", auto.detail));
  }
  if (!disabled.date && auto.dateText) {
    lines.push(formatFieldLine("date", auto.dateText));
  }
  return lines.join("\n");
}

export function applyAutoLabelsToDocument(
  text: string,
  disabled: FieldDisableFlags,
  prefixes: string[]
): string {
  const segments = extractSegments(text);
  if (segments.length === 0) return text;

  const lines = text.split("\n");
  const parts: string[] = [];
  let lastEnd = 0;

  for (const seg of segments) {
    const startLine = lines.findIndex((_, i) => lineStartOffset(lines, i) >= seg.start);
    const endLine = lines.findIndex((_, i) => lineStartOffset(lines, i) >= seg.end);
    if (startLine > 0) {
      parts.push(lines.slice(lastEnd, startLine).join("\n"));
    }
    parts.push(applyAutoLabelsToSegment(seg.rawText, disabled, prefixes));
    lastEnd = endLine >= 0 ? endLine : lines.length;
  }
  if (lastEnd < lines.length) {
    parts.push(lines.slice(lastEnd).join("\n"));
  }
  return parts.filter((p) => p.length > 0).join("\n");
}

export function findSegmentForOffset(text: string, offset: number): BeatSegment | null {
  const segments = extractSegments(text);
  return segments.find((s) => offset >= s.start && offset <= s.end) ?? null;
}

export function assignFieldInSegment(
  segmentText: string,
  field: BeatFieldKey,
  selectedText: string
): string {
  const lines = segmentText.split("\n");
  const fieldLine = formatFieldLine(field, selectedText);
  const key = isFieldLabelLine;
  let replaced = false;
  const next = lines.map((line) => {
    if (key(line) === field) {
      replaced = true;
      return fieldLine;
    }
    return line;
  });
  if (!replaced) {
    if (field === "title") next.unshift(fieldLine);
    else next.push(fieldLine);
  }
  return next.join("\n");
}

export function insertSeparatorAtCursor(text: string, cursorPos: number): string {
  const before = text.slice(0, cursorPos);
  const after = text.slice(cursorPos);
  const prefix = before.endsWith("\n") || before.length === 0 ? "" : "\n";
  const suffix = after.startsWith("\n") || after.length === 0 ? "" : "\n";
  return `${before}${prefix}${SEPARATOR_LINE}${suffix}${after}`;
}

export function segmentFieldsToBeatPayload(fields: BeatSegmentFields): {
  title: string;
  synopsis: string;
  detail: string;
  dateSpec: BeatDateSpec;
} {
  return {
    title: fields.title.trim() || "Beat",
    synopsis: fields.synopsis.trim(),
    detail: fields.detail.trim(),
    dateSpec: fields.dateSpec,
  };
}
