import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { Ctx, Oracle, Verdict } from "../../engine/types";
import { DEFAULT_CONFIG, type RepairConfig } from "../../engine/config";
import { Trace } from "../../engine/narrate";

export function tempRepo(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "engine-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  const write = (rel: string, body: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), body);
  };
  for (const [rel, body] of Object.entries(files)) write(rel, body);
  git("add", "-A");
  git("commit", "-qm", "base");
  return {
    dir,
    git,
    write,
    read: (rel: string) => readFileSync(path.join(dir, rel), "utf8"),
    commit: (msg: string) => { git("add", "-A"); git("commit", "-qm", msg); return git("rev-parse", "HEAD"); },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Oracle backed by a predicate list: each failing predicate becomes a failed assertion in a vitest-shaped report. */
export function fakeOracle(dir: string, checks: Record<string, () => boolean>, counter = { runs: 0 }): Oracle {
  return async (): Promise<Verdict> => {
    counter.runs++;
    const failed = Object.entries(checks).filter(([, ok]) => !ok()).map(([name]) => name);
    const report = {
      numPassedTests: Object.keys(checks).length - failed.length,
      numFailedTests: failed.length,
      success: failed.length === 0,
      testResults: [{
        name: path.join(dir, "tests/app.test.ts"),
        status: failed.length ? "failed" : "passed",
        assertionResults: Object.keys(checks).map((n) => ({
          fullName: n, status: failed.includes(n) ? "failed" : "passed",
          failureMessages: failed.includes(n) ? [`AssertionError: ${n} failed`] : [],
        })),
      }],
    };
    return { green: failed.length === 0, failing: failed.map((f) => `tests/app.test.ts::${f}`).sort(), report, tsc: "" };
  };
}

export function makeCtx(dir: string, oracle: Oracle, base: string | null, config: Partial<RepairConfig> = {}): Ctx {
  return { cwd: dir, config: { ...DEFAULT_CONFIG, ...config, llm: { ...DEFAULT_CONFIG.llm, ...(config.llm ?? {}) } }, oracle, trace: new Trace(), pulse: null, base, probes: { used: 0 } };
}
