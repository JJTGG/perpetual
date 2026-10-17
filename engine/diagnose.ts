/** Turns raw signals (pulse report, test report, tsc output, snapshots) into structured diagnoses. */
import { existsSync } from "node:fs";
import path from "node:path";
import type { PulseReport, TestReport } from "../scripts/lib";
import type { Diagnosis } from "./types";
import { PROVIDERS } from "../src/lib/providers";
import { assertPanel } from "../src/lib/pipeline";
import { readJsonAt } from "./workspace";
import type { Panel } from "../src/lib/types";

const SRC_FRAME = /(?:^|[\s(/])(src\/[\w./\-[\]]+\.tsx?):(\d+):\d+/m;
const READ_PROP = /Cannot read propert(?:y|ies) of (?:undefined|null) \(reading '([^']+)'\)/;
const OUTAGE = /HTTP (?:4(?:08|29)|5\d\d)\b|fetch failed|ECONN\w+|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|TimeoutError|AbortError|aborted due to timeout/;
const RUNTIME = /\b(TypeError|ReferenceError|RangeError|SyntaxError)\b/;

export function fromPulse(pulse: PulseReport | null): Diagnosis[] {
  if (!pulse) return [];
  return pulse.outcomes
    .filter((o) => !o.ok)
    .map((o): Diagnosis =>
      o.kind === "contract" && o.issues?.length
        ? { kind: "contract-drift", provider: o.id, issues: o.issues, rawFile: o.rawFile, detail: o.error ?? "" }
        : { kind: "outage", provider: o.id, detail: o.error ?? "unknown error" },
    );
}

export function fromSnapshots(cwd: string): Diagnosis[] {
  const out: Diagnosis[] = [];
  for (const p of PROVIDERS) {
    const file = `data/snapshots/${p.id}.json`;
    if (!existsSync(path.join(cwd, file))) continue;
    const snap = readJsonAt<Panel | null>(cwd, file, null);
    try {
      if (!snap) throw new Error("unreadable JSON");
      assertPanel(snap);
      if (snap.id !== p.id) throw new Error(`id is "${snap.id}"`);
    } catch (e) {
      out.push({ kind: "corrupt-snapshot", provider: p.id, file, detail: (e as Error).message });
    }
  }
  return out;
}

export function fromTests(report: TestReport | null, cwd: string, providerFailures: Set<string>): Diagnosis[] {
  if (!report) return [];
  const out: Diagnosis[] = [];
  for (const file of report.testResults) {
    const rel = path.relative(cwd, file.name);
    const failures = file.assertionResults.filter((a) => a.status === "failed").map((a) => ({ name: a.fullName, msg: a.failureMessages.join("\n") }));
    if (file.status === "failed" && failures.length === 0 && file.message) failures.push({ name: `${rel} (module)`, msg: file.message });
    for (const f of failures) {
      // Live-contract failures of feeds already diagnosed from the pulse report are not code bugs.
      const live = f.name.match(/live API contracts (\w+) honours/);
      if (live && providerFailures.has(live[1])) continue;
      // A live check can hit an outage the fetch step didn't see (e.g. a rate limit seconds later).
      const net = live && f.msg.match(OUTAGE);
      if (live && net) {
        out.push({ kind: "outage", provider: live[1], detail: net[0] });
        continue;
      }
      const frame = f.msg.match(SRC_FRAME);
      const loc = frame ? { file: frame[1], line: Number(frame[2]) } : {};
      const prop = f.msg.match(READ_PROP);
      if (prop || RUNTIME.test(f.msg.split("\n")[0])) out.push({ kind: "runtime-error", test: f.name, message: f.msg.slice(0, 2000), property: prop?.[1], ...loc });
      else out.push({ kind: "assertion", test: f.name, message: f.msg.slice(0, 2000), ...loc });
    }
  }
  return out;
}

export function fromTsc(output: string): Diagnosis[] {
  const out: Diagnosis[] = [];
  for (const m of output.matchAll(/^(\S+?\.tsx?)\((\d+),\d+\): error (TS\d+: .+)$/gm)) out.push({ kind: "type-error", file: m[1], line: Number(m[2]), message: m[3] });
  return out;
}

export function diagnose(cwd: string, pulse: PulseReport | null, report: TestReport | null, tsc: string): Diagnosis[] {
  const fromP = fromPulse(pulse);
  const failingProviders = new Set(fromP.map((d) => ("provider" in d ? d.provider : "")));
  // Quarantined feeds are already handled; don't re-diagnose them.
  const health = readJsonAt<{ quarantined: Record<string, unknown> }>(cwd, "config/health.json", { quarantined: {} });
  const pulseDiags = fromP.filter((d) => !("provider" in d) || !health.quarantined[d.provider]);
  return [...pulseDiags, ...fromSnapshots(cwd), ...fromTsc(tsc), ...fromTests(report, cwd, failingProviders)];
}

export const isCodeDiagnosis = (d: Diagnosis) => d.kind === "runtime-error" || d.kind === "assertion" || d.kind === "type-error";
