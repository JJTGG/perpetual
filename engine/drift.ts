/**
 * Contract-drift inference: given zod issues and the raw payload that failed,
 * deduce a declarative adapter (aliases / coercions) that makes it valid again.
 * Pure and deterministic: same inputs → same adapter, ties broken by name.
 */
import { z } from "zod";
import type { Adapter } from "../src/lib/adapters";
import type { ContractIssue } from "../scripts/lib";
import { similarity } from "./similarity";

export const MIN_SIMILARITY = 0.45;

export type Inference = {
  adapter: Adapter;
  reasons: string[];
  unresolved: string[];
};

const typeOf = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

/** "features.0.properties.mag" → "features[].properties.mag" */
export function normalizePath(path: (string | number)[]): string {
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") out += "[]";
    else out += (out ? "." : "") + seg;
  }
  return out;
}

/** Walk raw JSON along a normalized path to the first matching parent object. */
function parentAt(raw: unknown, path: (string | number)[]): Record<string, unknown> | undefined {
  let node: unknown = raw;
  for (const seg of path.slice(0, -1)) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string | number, unknown>)[seg];
  }
  return node !== null && typeof node === "object" && !Array.isArray(node) ? (node as Record<string, unknown>) : undefined;
}

/** Keys the schema itself declares on the parent (they are never alias sources). */
function declaredKeys(schema: z.ZodType | undefined, path: (string | number)[]): Set<string> {
  if (!schema) return new Set();
  try {
    let node = z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, any>;
    for (const seg of path.slice(0, -1)) {
      node = typeof seg === "number" ? node.items : node.properties?.[seg];
      if (!node) return new Set();
    }
    return new Set(Object.keys(node.properties ?? {}));
  } catch {
    return new Set();
  }
}

export function inferAdapter(issues: ContractIssue[], raw: unknown, schema?: z.ZodType, existing: Adapter = {}): Inference {
  const adapter: Adapter = { aliases: { ...(existing.aliases ?? {}) }, coerce: { ...(existing.coerce ?? {}) } };
  const reasons: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  for (const issue of issues) {
    const norm = normalizePath(issue.path);
    if (seen.has(norm)) continue;
    seen.add(norm);
    const key = issue.path[issue.path.length - 1];
    const parent = parentAt(raw, issue.path);
    if (typeof key !== "string" || !parent || issue.code !== "invalid_type" || !issue.expected) {
      unresolved.push(`${norm}: ${issue.message}`);
      continue;
    }
    const actual = parent[key];

    if (actual === undefined) {
      const declared = declaredKeys(schema, issue.path);
      const used = new Set(Object.values(adapter.aliases ?? {}));
      const ranked = Object.keys(parent)
        .filter((k) => !declared.has(k) && !used.has(k))
        .map((k) => ({ k, type: typeOf(parent[k]), score: similarity(key, k) }))
        .filter((c) => c.type === issue.expected || (issue.expected === "number" && c.type === "string" && Number.isFinite(Number(parent[c.k]))))
        .sort((a, b) => b.score - a.score || a.k.localeCompare(b.k));
      const best = ranked[0];
      if (best && best.score >= MIN_SIMILARITY) {
        adapter.aliases![norm] = best.k;
        reasons.push(`"${norm}" is missing; sibling "${best.k}" has the expected type (${issue.expected}) and similarity ${best.score.toFixed(2)}${ranked[1] ? ` (next best "${ranked[1].k}" at ${ranked[1].score.toFixed(2)})` : ""}`);
        if (best.type === "string" && issue.expected === "number") {
          adapter.coerce![norm] = "number";
          reasons.push(`"${best.k}" carries numbers as strings, so "${norm}" is also coerced to number`);
        }
      } else unresolved.push(`${norm}: missing and no sibling is similar enough${best ? ` (best "${best.k}" at ${best.score.toFixed(2)})` : ""}`);
    } else if (issue.expected === "number" && typeof actual === "string" && Number.isFinite(Number(actual))) {
      adapter.coerce![norm] = "number";
      reasons.push(`"${norm}" now arrives as a numeric string ("${actual}"), so it is coerced to number`);
    } else {
      unresolved.push(`${norm}: expected ${issue.expected}, got ${typeOf(actual)}`);
    }
  }
  if (Object.keys(adapter.aliases!).length === 0) delete adapter.aliases;
  if (Object.keys(adapter.coerce!).length === 0) delete adapter.coerce;
  return { adapter, reasons, unresolved };
}
