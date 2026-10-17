/**
 * CLI for the repair engine.
 *   tsx engine/run.ts housekeeping                         release recovered feeds (every pulse)
 *   tsx engine/run.ts repair [--base=<sha>] [--no-live] [--no-restore] [--mode=deterministic|hybrid|llm]
 * Exit code 0 = green, 1 = could not repair.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PulseReport, HealReport } from "../scripts/lib";
import type { Health, State } from "../src/lib/fsdata";
import { loadConfig, llmAvailable, apiKeyEnvName, type RepairMode } from "./config";
import { commandOracle } from "./oracle";
import { repair } from "./engine";
import { plan } from "./plan";
import { Trace } from "./narrate";
import { readJsonAt, writeJsonAt, tryGit } from "./workspace";

const cwd = process.cwd();
const [cmd = "repair", ...flags] = process.argv.slice(2);
const flag = (name: string) => flags.find((f) => f.startsWith(`--${name}`))?.split("=")[1] ?? (flags.includes(`--${name}`) ? "true" : undefined);

const report = readJsonAt<HealReport>(cwd, "heal-report.json", { actions: [], codeRestored: false });
const save = () => writeJsonAt(cwd, "heal-report.json", report);

if (cmd === "housekeeping") {
  const pulse = readJsonAt<PulseReport | null>(cwd, "pulse-report.json", null);
  const health = readJsonAt<Health>(cwd, "config/health.json", { quarantined: {}, updatedAt: null });
  for (const o of pulse?.outcomes ?? []) {
    if (o.ok && health.quarantined[o.id]) {
      delete health.quarantined[o.id];
      report.actions.push(`released ${o.id} from quarantine (healthy again)`);
      health.updatedAt = new Date().toISOString();
    }
  }
  writeJsonAt(cwd, "config/health.json", health);
  save();
  for (const a of report.actions) console.log(`housekeeping: ${a}`);
  process.exit(0);
}

const config = loadConfig(cwd);
if (flag("mode")) config.mode = flag("mode") as RepairMode;
const useLlm = llmAvailable(config);
const trace = new Trace();
if (config.mode !== "deterministic" && !useLlm)
  trace.add("observe", `mode "${config.mode}" requested but ${config.llm.provider === "openai-compatible" ? "no LLM_BASE_URL is set" : `${apiKeyEnvName(config)} is not set`}; running rule-based strategies only`);

const state = readJsonAt<State>(cwd, "data/state.json", { generation: 0, lastRunAt: null, lastDeploySlot: null, lastGreenSha: null });
let base = flag("base") ?? state.lastGreenSha;
if (base && !tryGit(cwd, ["cat-file", "-e", `${base}^{commit}`]).ok) base = null;

const result = await repair(
  { cwd, config, oracle: commandOracle(cwd, { live: flag("no-live") === undefined }), trace, pulse: readJsonAt(cwd, "pulse-report.json", null), base, probes: { used: 0 } },
  plan(config.mode, { llm: useLlm, restore: flag("no-restore") === undefined }),
);

report.actions.push(...result.actions);
report.codeRestored ||= result.codeRestored;
report.mode = useLlm ? config.mode : "deterministic";
report.trace = trace.entries.map((e) => `${e.step}: ${e.text}`);
save();
mkdirSync(path.join(cwd, ".pulse"), { recursive: true });
writeFileSync(path.join(cwd, ".pulse/repair-trace.md"), trace.toMarkdown(`Repair trace (${report.mode} mode)`));
console.log(trace.toMarkdown(`Repair trace (${report.mode} mode)`));
process.exit(result.green ? 0 : 1);
