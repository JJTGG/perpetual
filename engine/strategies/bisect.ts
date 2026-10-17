/**
 * Surgical revert: split the diff since the last green commit into hunks and use
 * delta debugging to find the smallest set of hunks whose revert turns the suite
 * green. Every other change is kept.
 */
import type { Strategy, Ctx } from "../types";
import { ddmin } from "../ddmin";
import { Checkpoint, tryGit } from "../workspace";
import { isCodeDiagnosis } from "../diagnose";

export type Unit = { file: string; header: string; body: string; label: string };

export function parseDiff(diff: string): Unit[] {
  const units: Unit[] = [];
  for (const chunk of diff.split(/^(?=diff --git )/m).filter((c) => c.startsWith("diff --git "))) {
    const file = chunk.match(/^\+\+\+ b\/(.+)$/m)?.[1] ?? chunk.match(/^diff --git a\/(\S+)/)?.[1] ?? "?";
    const firstHunk = chunk.search(/^@@/m);
    const header = firstHunk === -1 ? chunk : chunk.slice(0, firstHunk);
    const whole = firstHunk === -1 || /^(new file|deleted file|rename from|Binary files)/m.test(header);
    if (whole) {
      units.push({ file, header, body: firstHunk === -1 ? "" : chunk.slice(firstHunk), label: `${file} (whole file)` });
      continue;
    }
    const hunks = chunk.slice(firstHunk).split(/^(?=@@)/m).filter(Boolean);
    hunks.forEach((h, i) => {
      const at = h.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      const start = at ? Number(at[1]) : 0;
      const end = at ? start + Math.max(0, Number(at[2] ?? 1) - 1) : 0;
      units.push({ file, header, body: h, label: `${file} hunk ${i + 1}/${hunks.length} (lines ${start}–${end})` });
    });
  }
  return units;
}

export function buildPatch(units: Unit[]): string {
  const byFile = new Map<string, Unit[]>();
  for (const u of units) byFile.set(u.file, [...(byFile.get(u.file) ?? []), u]);
  let out = "";
  for (const [, us] of byFile) {
    out += us[0].header + us.map((u) => u.body).join("");
    if (!out.endsWith("\n")) out += "\n";
  }
  return out;
}

export function revertUnits(cwd: string, units: Unit[]): boolean {
  if (units.length === 0) return true;
  return tryGit(cwd, ["apply", "-R", "--whitespace=nowarn", "-"], buildPatch(units)).ok;
}

export const bisectStrategy: Strategy = {
  id: "hunk-bisect",
  kind: "deterministic",
  applies: (ds) => ds.some(isCodeDiagnosis),
  async propose(_ds, ctx: Ctx) {
    if (!ctx.base) return [];
    const diff = tryGit(ctx.cwd, ["diff", "--no-color", "--no-ext-diff", "-U3", ctx.base, "--", "src"]);
    if (!diff.ok || !diff.out) return [];
    const units = parseDiff(diff.out + "\n");
    if (units.length === 0) return [];
    ctx.trace.add("observe", `${units.length} changed hunk(s) in src/ since ${ctx.base.slice(0, 7)}; searching for the smallest set to revert`);
    const cp = new Checkpoint(ctx.cwd);
    const budget = { remaining: Math.max(0, ctx.config.maxProbes - ctx.probes.used) };
    const fixes = async (subset: typeof units) => {
      cp.restore();
      ctx.probes.used++;
      if (!revertUnits(ctx.cwd, subset)) return false;
      return (await ctx.oracle()).green;
    };
    try {
      if (budget.remaining <= 0 || !(budget.remaining--, await fixes(units))) {
        ctx.trace.add("reject", `reverting all ${units.length} hunk(s) would not make the suite green, so the defect is not (only) in recent src/ changes`);
        return [];
      }
      const minimal = units.length === 1 ? units : await ddmin(units, fixes, budget);
      const kept = units.length - minimal.length;
      return [{
        strategy: this.id,
        summary: `reverted ${minimal.map((u) => u.label).join(", ")}${kept ? ` and kept the other ${kept} change(s)` : ""}`,
        rationale: `delta debugging over ${units.length} hunk(s) showed that reverting exactly ${minimal.length} of them restores a green suite`,
        apply: async () => {
          if (!revertUnits(ctx.cwd, minimal)) throw new Error("minimal revert no longer applies");
        },
      }];
    } finally {
      cp.restore();
    }
  },
};
