/**
 * Pulse step 3 (only runs when tests fail): deterministic self-repair.
 *  1. Providers whose live fetch or contract failed are quarantined, so the app
 *     and the tests fall back to the last-good snapshot instead of breaking.
 *  2. Quarantined providers that are healthy again are released.
 *  3. Snapshots that violate panel invariants are restored from git.
 *  4. If non-provider tests still fail, application code is restored to the
 *     last commit that passed the full pulse (state.lastGreenSha).
 * Writes heal-report.json; the workflow re-runs the whole suite afterwards.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { PROVIDERS } from "../src/lib/providers";
import { assertPanel } from "../src/lib/pipeline";
import type { Panel } from "../src/lib/types";
import type { Health, State } from "../src/lib/fsdata";
import { readJson, writeJson, p, type PulseReport, type HealReport, type TestReport } from "./lib";

const mode = process.argv[2] ?? "data"; // "data" | "code"
const pulse = await readJson<PulseReport>("pulse-report.json", { at: new Date().toISOString(), outcomes: [] });
const health = await readJson<Health>("config/health.json", { quarantined: {}, updatedAt: null });
const state = await readJson<State>("data/state.json", { generation: 0, lastRunAt: null, lastDeploySlot: null, lastGreenSha: null });
const tests = await readJson<TestReport | null>("test-report.json", null);
const report = await readJson<HealReport>("heal-report.json", { actions: [], codeRestored: false });

const sh = (cmd: string) => execSync(cmd, { stdio: "pipe", encoding: "utf8" }).trim();

if (mode === "data") {
  for (const o of pulse.outcomes) {
    if (!o.ok && !health.quarantined[o.id]) {
      health.quarantined[o.id] = { since: pulse.at, reason: o.error ?? "unknown" };
      report.actions.push(`quarantined ${o.id} (${o.error})`);
    }
    if (o.ok && health.quarantined[o.id]) {
      delete health.quarantined[o.id];
      report.actions.push(`released ${o.id} from quarantine`);
    }
  }
  for (const prov of PROVIDERS) {
    const rel = `data/snapshots/${prov.id}.json`;
    if (!existsSync(p(rel))) continue;
    try {
      assertPanel(await readJson<Panel>(rel, null as unknown as Panel));
    } catch (err) {
      try {
        sh(`git checkout HEAD -- ${rel}`);
        report.actions.push(`restored corrupted snapshot ${rel} from git (${(err as Error).message})`);
      } catch {
        sh(`git rm -f --quiet ${rel} || rm -f ${rel}`);
        report.actions.push(`removed unrecoverable snapshot ${rel}`);
      }
    }
  }
  health.updatedAt = new Date().toISOString();
  await writeJson("config/health.json", health);
}

if (mode === "code") {
  const failing = (tests?.testResults ?? []).filter((t) => t.status === "failed").map((t) => t.name.replace(process.cwd() + "/", ""));
  const onlyLive = failing.length > 0 && failing.every((f) => f.includes("tests/integration/live"));
  if (onlyLive) {
    report.actions.push("only live-contract tests failing after quarantine; leaving code untouched");
  } else if (state.lastGreenSha && state.lastGreenSha !== sh("git rev-parse HEAD")) {
    sh(`git checkout ${state.lastGreenSha} -- src tests package.json package-lock.json`);
    report.codeRestored = true;
    report.actions.push(`restored src/, tests/ and dependencies to last green commit ${state.lastGreenSha.slice(0, 7)} (failing: ${failing.join(", ") || "unknown"})`);
  } else {
    report.actions.push(`no earlier green commit to restore; failing: ${failing.join(", ") || "unknown"}`);
  }
}

await writeJson("heal-report.json", report);
for (const a of report.actions) console.log(`heal: ${a}`);
