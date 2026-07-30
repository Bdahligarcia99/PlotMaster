/** Parse #rgb or #rrggbb to [r, g, b] in 0–255. */
function parseHex(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return null;
}

function toHexByte(n: number): string {
  const v = Math.round(Math.min(255, Math.max(0, n)));
  return v.toString(16).padStart(2, "0");
}

/** Blend two hex colors; `ratio` is the weight of `hex` (0 = all base, 1 = all hex). Returns opaque #rrggbb. */
export function mixHexColors(hex: string, baseHex: string, ratio: number): string {
  const a = parseHex(hex);
  const b = parseHex(baseHex);
  if (!a || !b) return baseHex;
  const t = Math.min(1, Math.max(0, ratio));
  const r = a[0] * t + b[0] * (1 - t);
  const g = a[1] * t + b[1] * (1 - t);
  const bl = a[2] * t + b[2] * (1 - t);
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(bl)}`;
}

/** App dark-bg — beat block base when tinting lane color. */
export const BEAT_BLOCK_BASE_BG = "#1a1a2e";

/** Subtle opaque tint of lane color on beat background (~20% lane, rest base). */
export function laneColorBeatBackground(laneColor: string): string {
  return mixHexColors(laneColor, BEAT_BLOCK_BASE_BG, 0.22);
}
