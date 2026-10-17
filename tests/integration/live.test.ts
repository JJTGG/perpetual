// Live contract tests: only run inside the pulse job (LIVE=1). Quarantined
// providers are skipped so a healed run can go green while they recover.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PROVIDERS } from "@/lib/providers";
import { fetchPanel } from "@/lib/pipeline";

const live = process.env.LIVE === "1";
const health = JSON.parse(readFileSync(path.resolve(__dirname, "../../config/health.json"), "utf8"));
const active = PROVIDERS.filter((p) => !health.quarantined[p.id]);

describe.skipIf(!live)("live API contracts", () => {
  it.each(active.map((p) => [p.id, p] as const))("%s honours its contract", async (_id, p) => {
    const panel = await fetchPanel(p);
    expect(panel.metrics.length).toBeGreaterThan(0);
  });
});
