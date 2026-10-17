/**
 * Pulse step 1: fetch every provider, validate it against its contract,
 * and persist last-good snapshots. Never exits non-zero: failures are
 * recorded in pulse-report.json for the test + heal steps.
 */
import { PROVIDERS } from "../src/lib/providers";
import { fetchPanel } from "../src/lib/pipeline";
import type { Panel } from "../src/lib/types";
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

const now = new Date();
const outcomes: ProviderOutcome[] = [];
for (const provider of PROVIDERS) {
  try {
    const panel = await fetchPanel(provider, fetch, now);
    const prev = await readJson<Panel | null>(`data/snapshots/${provider.id}.json`, null);
    await writeJson(`data/snapshots/${provider.id}.json`, panel);
    outcomes.push({ id: provider.id, ok: true, changes: diffPanels(prev, panel) });
    console.log(`✓ ${provider.id}`);
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 400) : String(err);
    outcomes.push({ id: provider.id, ok: false, error, changes: [] });
    console.log(`✗ ${provider.id}: ${error}`);
  }
}
const report: PulseReport = { at: now.toISOString(), outcomes };
await writeJson("pulse-report.json", report);
