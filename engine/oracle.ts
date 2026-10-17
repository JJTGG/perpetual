/** The single source of truth for "is this fixed?": typecheck + the full test suite. */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import type { TestReport } from "../scripts/lib";
import type { Oracle, Verdict } from "./types";
import { readJsonAt } from "./workspace";

export function failingIds(report: TestReport | null, tsc: string, cwd: string): string[] {
  const ids: string[] = [];
  for (const m of tsc.matchAll(/^(\S+?\.tsx?)\((\d+),\d+\): error/gm)) ids.push(`tsc::${m[1]}:${m[2]}`);
  for (const f of report?.testResults ?? []) {
    const rel = path.relative(cwd, f.name);
    const failed = f.assertionResults.filter((a) => a.status === "failed");
    if (f.status === "failed" && failed.length === 0) ids.push(`${rel}::(module)`);
    for (const a of failed) ids.push(`${rel}::${a.fullName}`);
  }
  return [...new Set(ids)].sort();
}

export function commandOracle(cwd: string, opts: { live: boolean }): Oracle {
  return async (): Promise<Verdict> => {
    const tsc = spawnSync("npx", ["tsc", "--noEmit"], { cwd, encoding: "utf8" });
    const out = path.join(cwd, ".pulse/oracle-report.json");
    rmSync(out, { force: true });
    spawnSync("npx", ["vitest", "run", "--reporter=json", `--outputFile=${out}`], {
      cwd, encoding: "utf8", env: { ...process.env, LIVE: opts.live ? "1" : "" },
    });
    const report = readJsonAt<TestReport | null>(cwd, ".pulse/oracle-report.json", null);
    const tscOut = (tsc.stdout ?? "") + (tsc.stderr ?? "");
    const failing = failingIds(report, tscOut, cwd);
    if (!report) failing.push("vitest::(no report)");
    return { green: failing.length === 0 && tsc.status === 0, failing, report, tsc: tscOut };
  };
}

/** A candidate is kept only if it strictly reduces failures and introduces none. */
export function improves(before: Verdict, after: Verdict): boolean {
  if (after.green) return true;
  const prev = new Set(before.failing);
  return after.failing.length < before.failing.length && after.failing.every((f) => prev.has(f));
}
