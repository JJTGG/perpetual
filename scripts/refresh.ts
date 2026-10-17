/**
 * Pulse step 1: fetch every provider, validate it against its contract,
 * and persist last-good snapshots. Never exits non-zero: failures are
 * classified (http / network / contract / invariant) in pulse-report.json and
 * raw failing payloads are kept in .pulse/raw/ for the repair engine.
 *
 *   tsx scripts/refresh.ts            all providers
 *   tsx scripts/refresh.ts --only=fx  one provider (merged into the existing report)
 */
import { ZodError } from "zod";
import { PROVIDERS } from "../src/lib/providers";
import { fetchRaw, panelFromRaw, HttpError } from "../src/lib/pipeline";
import type { Panel } from "../src/lib/types";
import type { Adapters } from "../src/lib/adapters";
import { readJson, writeJson, type PulseReport, type ProviderOutcome } from "./lib";

function diffPanels(prev: Panel | null, next: Panel): string[] {
  if (!prev) return [`${next.title}: first snapshot recorded`];
  const changes: string[] = [];
  for (const m of next.metrics) {
    const old = prev.metrics.find((x) => x.label === m.label);
    if (!old) changes.push(`${next.title}: new metric ${m.label} = ${m.value}`);
    else if (old.value !== m.value) changes.push(`${next.title}: ${m.label} ${old.value} → ${m.value}`);
  }
  return changes;
}

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const now = new Date();
const adapters = await readJson<Adapters>("config/adapters.json", {});
const previous = await readJson<PulseReport>("pulse-report.json", { at: now.toISOString(), outcomes: [] });
const outcomes: ProviderOutcome[] = only ? previous.outcomes.filter((o) => o.id !== only) : [];

for (const provider of PROVIDERS.filter((p) => !only || p.id === only)) {
  let json: unknown;
  try {
    json = await fetchRaw(provider);
    const panel = panelFromRaw(provider, json, adapters, now);
    const prev = await readJson<Panel | null>(`data/snapshots/${provider.id}.json`, null);
    await writeJson(`data/snapshots/${provider.id}.json`, panel);
    outcomes.push({ id: provider.id, ok: true, changes: diffPanels(prev, panel) });
    console.log(`✓ ${provider.id}`);
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 400) : String(err);
    const o: ProviderOutcome = { id: provider.id, ok: false, error, changes: [] };
    if (err instanceof HttpError) Object.assign(o, { kind: "http", status: err.status });
    else if (err instanceof ZodError) {
      o.kind = "contract";
      o.issues = err.issues.slice(0, 50).map((i) => ({ path: i.path as (string | number)[], code: i.code, expected: (i as { expected?: string }).expected, message: i.message }));
      o.error = `${provider.id}: contract violation at ${o.issues.slice(0, 3).map((i) => i.path.join(".")).join(", ")}`;
    } else o.kind = json === undefined ? "network" : "invariant";
    if (json !== undefined) {
      o.rawFile = `.pulse/raw/${provider.id}.json`;
      await writeJson(o.rawFile, json);
    }
    outcomes.push(o);
    console.log(`✗ ${provider.id} [${o.kind}]: ${o.error}`);
  }
}
outcomes.sort((a, b) => PROVIDERS.findIndex((p) => p.id === a.id) - PROVIDERS.findIndex((p) => p.id === b.id));
const report: PulseReport = { at: only ? previous.at : now.toISOString(), outcomes };
await writeJson("pulse-report.json", report);
