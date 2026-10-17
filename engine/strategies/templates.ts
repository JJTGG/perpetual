/**
 * Fix templates: small, well-known code rewrites keyed on a precise error signature
 * and location. Each template yields ordered variants; the oracle picks the first that works.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Strategy, Candidate, Diagnosis } from "../types";

type Runtime = Extract<Diagnosis, { kind: "runtime-error" }>;

export type Template = {
  id: string;
  matches: (d: Diagnosis) => d is Runtime;
  /** returns rewritten variants of the offending line, most conservative first */
  rewrite: (line: string, d: Runtime) => { line: string; note: string }[];
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const optionalChaining: Template = {
  id: "optional-chaining",
  matches: (d): d is Runtime => d.kind === "runtime-error" && Boolean(d.property && d.file && d.line),
  rewrite(line, d) {
    const re = new RegExp(`(?<!\\?)\\.(${escape(d.property!)})\\b`, "g");
    const hits = [...line.matchAll(re)];
    if (hits.length === 0) return [];
    const first = line.slice(0, hits[0].index!) + "?." + line.slice(hits[0].index! + 1);
    const variants = [{ line: first, note: `guarded the first \`.${d.property}\` access with \`?.\`` }];
    if (hits.length > 1) variants.push({ line: line.replace(re, "?.$1"), note: `guarded every \`.${d.property}\` access on the line with \`?.\`` });
    return variants;
  },
};

export const TEMPLATES: Template[] = [optionalChaining];

export const templatesStrategy: Strategy = {
  id: "fix-template",
  kind: "deterministic",
  applies: (ds) => ds.some((d) => TEMPLATES.some((t) => t.matches(d))),
  async propose(ds, ctx) {
    const out: Candidate[] = [];
    const seen = new Set<string>();
    for (const d of ds) {
      for (const t of TEMPLATES) {
        if (!t.matches(d)) continue;
        const key = `${t.id}:${d.file}:${d.line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const abs = path.join(ctx.cwd, d.file!);
        if (!existsSync(abs)) continue;
        const lines = readFileSync(abs, "utf8").split("\n");
        const original = lines[d.line! - 1];
        if (original === undefined) continue;
        for (const v of t.rewrite(original, d)) {
          out.push({
            strategy: `${this.id}:${t.id}`,
            summary: `${v.note} in ${d.file}:${d.line}`,
            rationale: `"${d.message.split("\n")[0]}" means the object before \`.${d.property}\` is missing at ${d.file}:${d.line}; the minimal fix is to tolerate its absence there`,
            apply: async () => {
              const cur = readFileSync(abs, "utf8").split("\n");
              cur[d.line! - 1] = v.line;
              writeFileSync(abs, cur.join("\n"));
            },
          });
        }
      }
    }
    return out;
  },
};
