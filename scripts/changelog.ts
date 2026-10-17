/**
 * Pulse step 4 (only after a fully green run): bump generation, decide whether
 * this pulse should redeploy, and append an entry to changelog.md.
 */
import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { appendEntry, formatEntry } from "../src/lib/changelog";
import { getRotation } from "../src/lib/rotation";
import type { Health, State } from "../src/lib/fsdata";
import { readJson, writeJson, p, setOutput, type PulseReport, type HealReport, type TestReport } from "./lib";

const pulse = await readJson<PulseReport>("pulse-report.json", { at: new Date().toISOString(), outcomes: [] });
const heal = await readJson<HealReport>("heal-report.json", { actions: [], codeRestored: false });
const tests = await readJson<TestReport | null>("test-report.json", null);
const health = await readJson<Health>("config/health.json", { quarantined: {}, updatedAt: null });
const state = await readJson<State>("data/state.json", { generation: 0, lastRunAt: null, lastDeploySlot: null, lastGreenSha: null });

const now = new Date(pulse.at);
const rotation = getRotation(now, Object.keys(health.quarantined));
const rotated = state.lastDeploySlot !== rotation.slot;
const deploy = rotated || heal.actions.length > 0;

const changes = pulse.outcomes.flatMap((o) => o.changes).slice(0, 12);
if (rotated) changes.unshift(`Rotated UI → theme ${rotation.theme.name}, layout ${rotation.layout}, chart ${rotation.chart}, spotlight ${rotation.featured}`);
if (changes.length === 0) changes.push("No value changes since last pulse");

const next: State = {
  generation: state.generation + 1,
  lastRunAt: pulse.at,
  lastDeploySlot: deploy ? rotation.slot : state.lastDeploySlot,
  lastGreenSha: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
};
await writeJson("data/state.json", next);

const md = await readFile(p("changelog.md"), "utf8").catch(() => "");
const entry = formatEntry({
  at: pulse.at,
  generation: next.generation,
  slot: rotation.slot,
  theme: rotation.theme.name,
  layout: rotation.layout,
  live: pulse.outcomes.filter((o) => o.ok).map((o) => o.id),
  changes,
  healed: heal.actions,
  tests: { passed: tests?.numPassedTests ?? 0, failed: tests?.numFailedTests ?? 0 },
});
await writeFile(p("changelog.md"), appendEntry(md, entry));
await setOutput("deploy", String(deploy));
await setOutput("generation", String(next.generation));
console.log(entry);
