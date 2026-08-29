const MAX_DEPTH = 3;
const MAX_ARRAY = 20;
const MAX_STRING = 200;
const MAX_KEYS = 30;

function truncateString(s: string): string {
  if (s.length <= MAX_STRING) return s;
  return `${s.slice(0, MAX_STRING)}…`;
}

/** Depth/length-capped serializer for log payloads. Never dumps full node/edge arrays. */
export function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null) return value;
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[Function]";
  if (typeof value === "symbol") return value.toString();

  if (depth >= MAX_DEPTH) {
    if (Array.isArray(value)) return `[Array(${value.length})]`;
    return "[Object]";
  }

  if (Array.isArray(value)) {
    const slice = value.slice(0, MAX_ARRAY);
    const mapped = slice.map((v) => sanitize(v, depth + 1, seen));
    if (value.length > MAX_ARRAY) {
      mapped.push(`…+${value.length - MAX_ARRAY} more`);
    }
    return mapped;
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: truncateString(value.message) };
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const out: Record<string, unknown> = {};
    const limit = Math.min(keys.length, MAX_KEYS);
    for (let i = 0; i < limit; i += 1) {
      const k = keys[i]!;
      if (k === "nodes" && Array.isArray(obj[k])) {
        out[k] = `[nodes: ${(obj[k] as unknown[]).length}]`;
        continue;
      }
      if (k === "edges" && Array.isArray(obj[k])) {
        out[k] = `[edges: ${(obj[k] as unknown[]).length}]`;
        continue;
      }
      out[k] = sanitize(obj[k], depth + 1, seen);
    }
    if (keys.length > MAX_KEYS) {
      out["…"] = `+${keys.length - MAX_KEYS} keys`;
    }
    return out;
  }

  return String(value);
}
