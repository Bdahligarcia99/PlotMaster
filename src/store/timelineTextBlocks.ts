import { generateTimelineId } from "../storage/timelineIds";
import { generateTimelineScript, getEmptyBeatScriptBlock } from "./timelineScript";

export interface TextBlockSpan {
  start: number;
  end: number;
}

export interface LaneBlockSpan extends TextBlockSpan {
  laneId: string;
}

export interface BeatBlockSpan extends TextBlockSpan {
  beatId: string;
  slot: number;
}

export interface LaneBeatsArraySpan {
  arrayOpen: number;
  arrayClose: number;
  beats: BeatBlockSpan[];
}

function advancePastQuotedString(text: string, start: number): number {
  if (text[start] !== '"') return start;
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === '"') return i + 1;
    i++;
  }
  return text.length;
}

/** Quote-aware brace matcher; returns index after closing `}`. */
export function findMatchingBrace(text: string, openBraceIndex: number): number | null {
  if (text[openBraceIndex] !== "{") return null;
  let depth = 0;
  for (let i = openBraceIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      i = advancePastQuotedString(text, i) - 1;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

/** Quote-aware bracket matcher; returns index after closing `]`. */
export function findMatchingBracket(text: string, openBracketIndex: number): number | null {
  if (text[openBracketIndex] !== "[") return null;
  let depth = 0;
  for (let i = openBracketIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      i = advancePastQuotedString(text, i) - 1;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

export function findLaneBlockSpans(text: string): LaneBlockSpan[] {
  const results: LaneBlockSpan[] = [];
  const re = /^Lane\s+(\S+)/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const laneId = match[1];
    const headerStart = match.index;
    const braceIdx = text.indexOf("{", match.index);
    if (braceIdx === -1) continue;
    const lineEnd = text.indexOf("\n", match.index);
    if (lineEnd !== -1 && braceIdx > lineEnd) continue;
    const closeBrace = findMatchingBrace(text, braceIdx);
    if (closeBrace == null) continue;
    results.push({ laneId, start: headerStart, end: closeBrace });
    re.lastIndex = closeBrace;
  }
  return results;
}

export function findBeatBlockSpansInLane(
  text: string,
  laneSpan: LaneBlockSpan
): LaneBeatsArraySpan | null {
  const laneText = text.slice(laneSpan.start, laneSpan.end);
  const beatsMatch = /beats:\s*\[/i.exec(laneText);
  if (!beatsMatch) return null;

  const arrayOpenRel = beatsMatch.index + beatsMatch[0].length - 1;
  const arrayOpen = laneSpan.start + arrayOpenRel;
  const arrayClose = findMatchingBracket(text, arrayOpen);
  if (arrayClose == null) return null;

  const beats: BeatBlockSpan[] = [];
  const arraySlice = text.slice(arrayOpen + 1, arrayClose - 1);
  const beatRe = /Beat\s+(\S+)[^\n]*slot:\s*(-?\d+)/gi;
  let beatMatch: RegExpExecArray | null;
  while ((beatMatch = beatRe.exec(arraySlice)) !== null) {
    const beatId = beatMatch[1];
    const slot = Number.parseInt(beatMatch[2], 10) || 0;
    const relStart = beatMatch.index;
    const braceRel = arraySlice.indexOf("{", relStart);
    if (braceRel === -1) continue;
    const absBrace = arrayOpen + 1 + braceRel;
    const beatEnd = findMatchingBrace(text, absBrace);
    if (beatEnd == null) continue;
    beats.push({
      beatId,
      slot,
      start: arrayOpen + 1 + relStart,
      end: beatEnd,
    });
    beatRe.lastIndex = beatEnd - (arrayOpen + 1);
  }

  return { arrayOpen, arrayClose, beats };
}

function laneContainingCursor(laneSpans: LaneBlockSpan[], cursorPos: number): LaneBlockSpan | null {
  for (const span of laneSpans) {
    if (cursorPos >= span.start && cursorPos <= span.end) return span;
  }
  return null;
}

function patchBeatSlotInText(beatText: string, newSlot: number): string {
  return beatText.replace(/slot:\s*-?\d+/i, `slot: ${newSlot}`);
}

export type InsertBeatResult =
  | { ok: true; content: string; beatId: string; slot: number; cursorPos: number }
  | { ok: false; error: string };

/**
 * Insert a new Beat block into lane-file text at the cursor.
 * Targets the lane under the cursor when multiple lanes exist; with one lane, always that lane.
 */
export function insertBeatAtCursor(content: string, cursorPos: number): InsertBeatResult {
  const laneSpans = findLaneBlockSpans(content);
  if (laneSpans.length === 0) {
    return { ok: false, error: "No Lane block found in this file." };
  }

  let targetLane: LaneBlockSpan;
  if (laneSpans.length === 1) {
    targetLane = laneSpans[0];
  } else {
    const containing = laneContainingCursor(laneSpans, cursorPos);
    if (!containing) {
      return {
        ok: false,
        error: "Place the cursor inside a Lane's beats array to insert a beat there.",
      };
    }
    targetLane = containing;
  }

  const beatsInfo = findBeatBlockSpansInLane(content, targetLane);
  if (!beatsInfo) {
    return { ok: false, error: "Lane block has no beats: [ ] array." };
  }

  const beatId = generateTimelineId();
  const beats = beatsInfo.beats;
  const insertIndex = beats.filter((b) => b.end <= cursorPos).length;

  let slot: number;
  let needsShift = false;

  if (beats.length === 0) {
    slot = 0;
  } else if (insertIndex === 0) {
    slot = 0;
    needsShift = beats[0].slot <= slot;
  } else if (insertIndex >= beats.length) {
    slot = beats[beats.length - 1].slot + 1;
  } else {
    const prevSlot = beats[insertIndex - 1].slot;
    slot = prevSlot + 1;
    needsShift = beats[insertIndex].slot <= slot;
  }

  const beatTexts: string[] = [];
  for (let i = 0; i < beats.length; i++) {
    let text = content.slice(beats[i].start, beats[i].end).trim();
    if (needsShift && i >= insertIndex) {
      text = patchBeatSlotInText(text, beats[i].slot + 1);
    }
    beatTexts.push(text);
  }

  const newBlock = getEmptyBeatScriptBlock(beatId, slot);
  beatTexts.splice(insertIndex, 0, newBlock.trim());

  const arrayBody =
    beatTexts.length === 0
      ? "\n    "
      : `\n    ${beatTexts.join(",\n    ")}\n  `;

  const nextContent =
    content.slice(0, beatsInfo.arrayOpen + 1) +
    arrayBody +
    content.slice(beatsInfo.arrayClose - 1);

  const blockEndMarker = `Beat ${beatId}`;
  const blockStartInContent = nextContent.indexOf(blockEndMarker);
  const blockCloseBrace = nextContent.indexOf("}", blockStartInContent);
  const resultCursorPos = blockCloseBrace === -1 ? cursorPos : blockCloseBrace + 1;

  return { ok: true, content: nextContent, beatId, slot, cursorPos: resultCursorPos };
}

export type InsertLaneResult =
  | { ok: true; content: string; laneId: string; cursorPos: number }
  | { ok: false; error: string };

/** Append a new empty Lane block to the end of the file (or create as sole content). */
export function insertLaneAtCursor(
  content: string,
  sortOrder: number,
  label: string
): InsertLaneResult {
  const laneId = generateTimelineId();
  const block = generateTimelineScript(
    [
      {
        id: laneId,
        label,
        laneType: "character",
        sortOrder,
      },
    ],
    [],
    [],
    { includeSectionMarkers: false }
  ).trim();

  const laneSpans = findLaneBlockSpans(content);
  let nextContent: string;
  if (laneSpans.length === 0) {
    const trimmed = content.trim();
    nextContent = trimmed.length === 0 ? block : `${trimmed}\n\n${block}`;
  } else {
    const last = laneSpans[laneSpans.length - 1]!;
    const insertAt = last.end;
    const needsSep =
      content.slice(0, insertAt).trim().length > 0 || content.slice(insertAt).trim().length > 0;
    const prefix = needsSep ? "\n\n" : "";
    nextContent = content.slice(0, insertAt) + prefix + block + content.slice(insertAt);
  }

  const laneMarker = `Lane ${laneId}`;
  const idx = nextContent.indexOf(laneMarker);
  const closeBrace = nextContent.indexOf("}", idx);
  const cursorPos = closeBrace === -1 ? nextContent.length : closeBrace + 1;

  return { ok: true, content: nextContent, laneId, cursorPos };
}

/** Remove a lane block span and any adjacent blank line. */
export function removeLaneBlockFromText(content: string, span: LaneBlockSpan): string {
  let removeStart = span.start;
  let removeEnd = span.end;
  while (removeEnd < content.length && (content[removeEnd] === "\n" || content[removeEnd] === "\r")) {
    removeEnd++;
  }
  if (removeStart > 0 && content[removeStart - 1] === "\n") {
    removeStart--;
  }
  return content.slice(0, removeStart) + content.slice(removeEnd);
}
