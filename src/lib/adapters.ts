/**
 * Declarative response adapters, written by the repair engine when an upstream
 * API drifts (renamed field, number-as-string). Applied before schema parsing.
 *
 * Path syntax: dot-separated keys, `[]` maps over array elements.
 *   aliases: { "current.temperature_2m": "temp_2m" }  → copy sibling `temp_2m` into `temperature_2m`
 *   coerce:  { "features[].properties.mag": "number" } → numeric strings become numbers
 */
export type Adapter = { aliases?: Record<string, string>; coerce?: Record<string, "number"> };
export type Adapters = Record<string, Adapter>;

export function splitPath(path: string): string[] {
  return path.split(".").flatMap((seg) => (seg.endsWith("[]") ? [seg.slice(0, -2), "[]"] : [seg])).filter(Boolean);
}

/** Visit every parent object addressed by `segs` (all but the last key). */
function eachParent(node: unknown, segs: string[], fn: (parent: Record<string, unknown>, key: string) => void): void {
  if (segs.length === 0 || node === null || typeof node !== "object") return;
  const [head, ...rest] = segs;
  if (head === "[]") {
    if (Array.isArray(node)) for (const el of node) eachParent(el, rest, fn);
    return;
  }
  if (rest.length === 0) return fn(node as Record<string, unknown>, head);
  eachParent((node as Record<string, unknown>)[head], rest, fn);
}

export function applyAdapter(raw: unknown, adapter: Adapter | undefined): unknown {
  if (!adapter) return raw;
  const out = structuredClone(raw);
  for (const [to, fromKey] of Object.entries(adapter.aliases ?? {})) {
    eachParent(out, splitPath(to), (parent, key) => {
      if (parent[key] === undefined && parent[fromKey] !== undefined) parent[key] = parent[fromKey];
    });
  }
  for (const [path, kind] of Object.entries(adapter.coerce ?? {})) {
    eachParent(out, splitPath(path), (parent, key) => {
      const v = parent[key];
      if (kind === "number" && typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) parent[key] = Number(v);
    });
  }
  return out;
}
