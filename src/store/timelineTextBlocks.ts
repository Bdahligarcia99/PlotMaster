import { generateTimelineId } from "../storage/timelineIds";
import { getEmptyBeatScriptBlock } from "./timelineScript";

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

function shiftBeatSlotsInLaneText(
  text: string,
  beats: BeatBlockSpan[],
  fromIndex: number,
  delta: number
): string {
  if (delta === 0 || fromIndex >= beats.length) return text;
  let result = text;
  const toShift = beats.slice(fromIndex).sort((a, b) => b.start - a.start);
  for (const beat of toShift) {
    const headerSlice = result.slice(beat.start, Math.min(beat.end, beat.start + 120));
    const slotMatch = /slot:\s*(-?\d+)/i.exec(headerSlice);
    if (!slotMatch) continue;
    const absSlotStart = beat.start + slotMatch.index;
    const absSlotEnd = absSlotStart + slotMatch[0].length;
    const newSlot = beat.slot + delta;
    result =
      result.slice(0, absSlotStart) +
      `slot: ${newSlot}` +
      result.slice(absSlotEnd);
  }
  return result;
}

export type InsertBeatResult =
  | { ok: true; content: string; beatId: string; slot: number }
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

  let working = content;
  let laneSpan = targetLane;
  const beatsInfo = findBeatBlockSpansInLane(working, laneSpan);
  if (!beatsInfo) {
    return { ok: false, error: "Lane block has no beats: [ ] array." };
  }

  const beatId = generateTimelineId();
  let insertAt: number;
  let slot: number;

  const beats = beatsInfo.beats;

  if (beats.length === 0) {
    insertAt = beatsInfo.arrayOpen + 1;
    slot = 0;
  } else {
    let betweenIndex: number | null = null;
    for (let i = 0; i < beats.length - 1; i++) {
      const gapStart = beats[i].end;
      const gapEnd = beats[i + 1].start;
      if (cursorPos >= gapStart && cursorPos <= gapEnd) {
        betweenIndex = i;
        break;
      }
    }

    if (betweenIndex != null) {
      const beatA = beats[betweenIndex];
      const beatB = beats[betweenIndex + 1];
      if (beatB.slot - beatA.slot > 1) {
        slot = beatA.slot + 1;
        insertAt = beatB.start;
      } else {
        working = shiftBeatSlotsInLaneText(working, beats, betweenIndex + 1, 1);
        laneSpan = findLaneBlockSpans(working).find((s) => s.laneId === targetLane.laneId)!;
        const refreshed = findBeatBlockSpansInLane(working, laneSpan)!;
        const refreshedBeats = refreshed.beats;
        slot = beatA.slot + 1;
        insertAt = refreshedBeats[betweenIndex + 1].start;
      }
    } else if (cursorPos < beats[0].start) {
      if (beats[0].slot > 0) {
        slot = 0;
        insertAt = beats[0].start;
      } else {
        working = shiftBeatSlotsInLaneText(working, beats, 0, 1);
        laneSpan = findLaneBlockSpans(working).find((s) => s.laneId === targetLane.laneId)!;
        const refreshed = findBeatBlockSpansInLane(working, laneSpan)!;
        slot = 0;
        insertAt = refreshed.beats[0].start;
      }
    } else {
      const last = beats[beats.length - 1];
      slot = last.slot + 1;
      insertAt = last.end;
    }
  }

  const block = getEmptyBeatScriptBlock(beatId, slot);
  const needsComma =
    insertAt > beatsInfo.arrayOpen + 1 &&
    working.slice(beatsInfo.arrayOpen + 1, insertAt).trim().length > 0;
  const prefix = needsComma && !working.slice(0, insertAt).trimEnd().endsWith(",") ? ",\n" : "\n";
  const insertion = `${prefix}${block}`;

  const nextContent =
    working.slice(0, insertAt) + insertion + working.slice(insertAt);

  return { ok: true, content: nextContent, beatId, slot };
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
