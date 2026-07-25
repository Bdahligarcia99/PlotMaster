import { dateSpecFromResolvedText, emptyBeatDateSpec, resolveBeatDate } from "../../../utils/beatDate";
import type { BeatDateSpec, TimelineBeat } from "../../../store/timelineTypes";
import { SEPARATOR_LINE, isFieldLabelLine, isSeparatorLine, parseFieldLabelValue } from "./beatDocumentModel";

export interface ParsedLaneBeatBlock {
  beatId: string | null;
  title: string;
  synopsis: string;
  detail: string;
  dateSpec: BeatDateSpec;
  /** 1-based block index in the file (for error messages). */
  blockIndex: number;
}

export interface ParseLaneFileResult {
  blocks: ParsedLaneBeatBlock[];
  errors: string[];
  /** True when the file has no beat blocks and no meaningful content. */
  isEmpty: boolean;
}

const KNOWN_FIELD_KEYS = new Set(["title", "synopsis", "detail", "date"]);
const ID_LINE = /^id:\s*(\S+)\s*$/i;

function serializeDateLine(beat: TimelineBeat, allBeats: TimelineBeat[]): string {
  const display = resolveBeatDate(beat, allBeats);
  return display;
}

/** Generate a derived lane file from beats in slot order (ascending). */
export function generateLaneFileContent(beats: TimelineBeat[], allBeats: TimelineBeat[]): string {
  const sorted = [...beats].sort((a, b) => a.slot - b.slot);
  if (sorted.length === 0) return "";

  const parts: string[] = [];
  for (const beat of sorted) {
    const dateText = serializeDateLine(beat, allBeats);
    parts.push(`id: ${beat.id}`);
    parts.push(`Title: ${beat.title}`);
    parts.push(`Synopsis: ${beat.synopsis}`);
    parts.push(`Detail: ${beat.detail}`);
    parts.push(`Date: ${dateText}`);
    parts.push(SEPARATOR_LINE);
  }
  return parts.join("\n") + (parts.length > 0 ? "\n" : "");
}

export function getEmptyBeatTemplateBlock(): string {
  return `Title: 
Synopsis: 
Detail: 
Date: 
${SEPARATOR_LINE}
`;
}

/**
 * Parse a lane (or user-made) file into beat template blocks.
 * Hard errors: empty title, duplicate ids, unknown field labels, malformed structure.
 * Caller must additionally validate that known ids belong to the target lane.
 */
export function parseLaneFileContent(text: string): ParseLaneFileResult {
  const errors: string[] = [];
  const blocks: ParsedLaneBeatBlock[] = [];
  const lines = text.split("\n");
  const trimmedWhole = text.trim();
  if (!trimmedWhole) {
    return { blocks: [], errors: [], isEmpty: true };
  }

  // Split into raw blocks on separator lines
  const rawBlocks: { lines: string[]; startLine: number }[] = [];
  let current: string[] = [];
  let blockStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (isSeparatorLine(lines[i])) {
      if (current.some((l) => l.trim())) {
        rawBlocks.push({ lines: current, startLine: blockStart });
      }
      current = [];
      blockStart = i + 1;
    } else {
      if (current.length === 0) blockStart = i;
      current.push(lines[i]);
    }
  }
  if (current.some((l) => l.trim())) {
    rawBlocks.push({ lines: current, startLine: blockStart });
  }

  // File with only separators / whitespace
  if (rawBlocks.length === 0) {
    return { blocks: [], errors: [], isEmpty: true };
  }

  const seenIds = new Set<string>();

  for (let bi = 0; bi < rawBlocks.length; bi++) {
    const blockIndex = bi + 1;
    const blockLines = rawBlocks[bi].lines;
    let beatId: string | null = null;
    let title = "";
    let synopsis = "";
    let detail = "";
    let dateText = "";
    let sawAnyField = false;

    for (const rawLine of blockLines) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      if (!trimmed) continue;

      const idMatch = ID_LINE.exec(trimmed);
      if (idMatch) {
        if (beatId != null) {
          errors.push(`Block ${blockIndex}: duplicate id: line`);
        }
        beatId = idMatch[1];
        continue;
      }

      const fieldKey = isFieldLabelLine(trimmed);
      if (fieldKey) {
        sawAnyField = true;
        const val = parseFieldLabelValue(trimmed, fieldKey);
        if (fieldKey === "title") title = val;
        else if (fieldKey === "synopsis") synopsis = val;
        else if (fieldKey === "detail") detail = val;
        else if (fieldKey === "date") dateText = val;
        continue;
      }

      // Unknown "Key: value" style line
      if (/^[A-Za-z][\w\s]*:\s*/.test(trimmed)) {
        const label = trimmed.split(":")[0].trim();
        if (!KNOWN_FIELD_KEYS.has(label.toLowerCase()) && label.toLowerCase() !== "id") {
          errors.push(`Block ${blockIndex}: unknown field "${label}"`);
        } else {
          errors.push(`Block ${blockIndex}: malformed field line`);
        }
        continue;
      }

      // Free text without a label inside a template block — hard error (don't silently append)
      errors.push(
        `Block ${blockIndex}: unexpected text without a field label (line ${rawBlocks[bi].startLine + 1}+)`
      );
    }

    if (!sawAnyField && beatId == null) {
      errors.push(`Block ${blockIndex}: empty or unrecognized beat template`);
      continue;
    }

    if (!title.trim()) {
      errors.push(`Block ${blockIndex}: Title is required (cannot save an empty beat)`);
    }

    if (beatId) {
      if (seenIds.has(beatId)) {
        errors.push(`Block ${blockIndex}: duplicate beat id "${beatId}"`);
      } else {
        seenIds.add(beatId);
      }
    }

    blocks.push({
      beatId,
      title: title.trim(),
      synopsis,
      detail,
      dateSpec: dateText.trim() ? dateSpecFromResolvedText(dateText) : emptyBeatDateSpec(),
      blockIndex,
    });
  }

  return {
    blocks,
    errors,
    isEmpty: blocks.length === 0 && errors.length === 0,
  };
}

/** After parse, ensure every id belongs to `laneBeatIds`. */
export function validateBlockIdsForLane(
  blocks: ParsedLaneBeatBlock[],
  laneBeatIds: Set<string>
): string[] {
  const errors: string[] = [];
  for (const block of blocks) {
    if (block.beatId && !laneBeatIds.has(block.beatId)) {
      errors.push(
        `Block ${block.blockIndex}: beat id "${block.beatId}" is not on this lane (or does not exist)`
      );
    }
  }
  return errors;
}
