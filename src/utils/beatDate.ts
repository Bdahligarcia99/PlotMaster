import type { BeatDateSpec, TimelineBeat } from "../store/timelineTypes";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyBeatDateSpec(): BeatDateSpec {
  return { mode: "none" };
}

export function migrateLegacyDateString(date: string | undefined): BeatDateSpec {
  const trimmed = (date ?? "").trim();
  if (!trimmed) return emptyBeatDateSpec();
  if (ISO_DATE.test(trimmed)) {
    return { mode: "absolute", absolute: trimmed };
  }
  return { mode: "label", label: trimmed };
}

export function addDateOffset(isoDate: string, years: number, months: number, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCMonth(date.getUTCMonth() + months);
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatIsoDateDisplay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${monthNames[m - 1]} ${d}, ${y}`;
}

export function resolveBeatDate(
  beat: TimelineBeat,
  allBeats: TimelineBeat[],
  visited: Set<string> = new Set()
): string {
  if (visited.has(beat.id)) return "";
  visited.add(beat.id);

  const spec = beat.dateSpec;
  if (spec.mode === "none") return "";
  if (spec.mode === "label") {
    return (spec.label ?? "").trim();
  }
  if (spec.mode === "resolved") {
    return (spec.resolved ?? "").trim();
  }
  if (spec.mode === "absolute") {
    const iso = spec.absolute?.trim() ?? "";
    return iso ? formatIsoDateDisplay(iso) : "";
  }
  if (spec.mode === "relative" && spec.relative) {
    const origin = allBeats.find((b) => b.id === spec.relative!.originBeatId);
    if (!origin) return "";
    const originResolved = resolveBeatAbsoluteIso(origin, allBeats, visited);
    if (!originResolved) return "";
    const { years, months, days } = spec.relative;
    const resultIso = addDateOffset(originResolved, years, months, days);
    return formatIsoDateDisplay(resultIso);
  }
  return "";
}

/** Returns ISO date for absolute mode or resolved relative chain; empty if unavailable. */
export function resolveBeatAbsoluteIso(
  beat: TimelineBeat,
  allBeats: TimelineBeat[],
  visited: Set<string> = new Set()
): string {
  if (visited.has(beat.id)) return "";
  visited.add(beat.id);

  const spec = beat.dateSpec;
  if (spec.mode === "none") return "";
  if (spec.mode === "absolute") {
    return spec.absolute?.trim() ?? "";
  }
  if (spec.mode === "relative" && spec.relative) {
    const origin = allBeats.find((b) => b.id === spec.relative!.originBeatId);
    if (!origin) return "";
    const originIso = resolveBeatAbsoluteIso(origin, allBeats, visited);
    if (!originIso) return "";
    const { years, months, days } = spec.relative;
    return addDateOffset(originIso, years, months, days);
  }
  return "";
}

export function parseCalendarTextToIso(text: string): string | null {
  const trimmed = text.trim();
  if (ISO_DATE.test(trimmed)) return trimmed;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const month = String(Number(slash[1])).padStart(2, "0");
    const day = String(Number(slash[2])).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return null;
}

export function dateSpecFromImportText(text: string): BeatDateSpec {
  const trimmed = text.trim();
  if (!trimmed) return emptyBeatDateSpec();
  const iso = parseCalendarTextToIso(trimmed);
  if (iso) return { mode: "absolute", absolute: iso };
  return { mode: "label", label: trimmed };
}

/** Beat Text Editor default: store raw detected/assigned date text as-is. */
export function dateSpecFromResolvedText(text: string): BeatDateSpec {
  const trimmed = text.trim();
  if (!trimmed) return emptyBeatDateSpec();
  return { mode: "resolved", resolved: trimmed };
}
