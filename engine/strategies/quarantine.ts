import type { Strategy, Diagnosis } from "../types";
import { readJsonAt, writeJsonAt } from "../workspace";
import type { Health } from "../../src/lib/fsdata";

type Feed = Extract<Diagnosis, { kind: "outage" | "contract-drift" }>;

export function quarantineStrategy(opts: { outageOnly: boolean }): Strategy {
  const pick = (ds: Diagnosis[]) => ds.filter((d): d is Feed => d.kind === "outage" || (!opts.outageOnly && d.kind === "contract-drift"));
  return {
    id: opts.outageOnly ? "quarantine-outages" : "quarantine",
    kind: "deterministic",
    applies: (ds) => pick(ds).length > 0,
    async propose(ds, ctx) {
      const feeds = pick(ds);
      return [{
        strategy: this.id,
        summary: `quarantined ${feeds.map((f) => f.provider).join(", ")} (${feeds.map((f) => f.detail).join("; ").slice(0, 200)})`,
        rationale: `the failure is outside this codebase, so the safest change is to serve the last-good snapshot and re-test the feed every pulse until it recovers`,
        apply: async () => {
          const h = readJsonAt<Health>(ctx.cwd, "config/health.json", { quarantined: {}, updatedAt: null });
          const at = new Date().toISOString();
          for (const f of feeds) h.quarantined[f.provider] = { since: at, reason: f.detail };
          h.updatedAt = at;
          writeJsonAt(ctx.cwd, "config/health.json", h);
        },
      }];
    },
  };
}
