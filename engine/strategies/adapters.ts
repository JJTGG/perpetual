/** Deterministic API-drift repair: infer field aliases / coercions and record them in config/adapters.json. */
import { spawnSync } from "node:child_process";
import type { Strategy, Candidate, Diagnosis } from "../types";
import type { Adapters } from "../../src/lib/adapters";
import { getProvider } from "../../src/lib/providers";
import { panelFromRaw } from "../../src/lib/pipeline";
import { inferAdapter } from "../drift";
import { readJsonAt, writeJsonAt } from "../workspace";

export const adaptersStrategy: Strategy = {
  id: "drift-adapter",
  kind: "deterministic",
  applies: (ds) => ds.some((d) => d.kind === "contract-drift"),
  async propose(ds, ctx) {
    const out: Candidate[] = [];
    const adapters = readJsonAt<Adapters>(ctx.cwd, "config/adapters.json", {});
    for (const d of ds.filter((x): x is Extract<Diagnosis, { kind: "contract-drift" }> => x.kind === "contract-drift")) {
      const provider = getProvider(d.provider);
      if (!provider || !d.rawFile) continue;
      const raw = readJsonAt<unknown>(ctx.cwd, d.rawFile, undefined);
      if (raw === undefined) continue;
      const inf = inferAdapter(d.issues, raw, provider.schema, adapters[d.provider]);
      if (inf.unresolved.length) ctx.trace.add("diagnose", `Unresolved drift in ${d.provider}: ${inf.unresolved.join("; ")}`);
      if (!inf.reasons.length) continue;
      // Pre-flight: the inferred adapter must make the exact failing payload valid before we touch anything.
      try {
        panelFromRaw(provider, raw, { ...adapters, [d.provider]: inf.adapter }, new Date());
      } catch (e) {
        ctx.trace.add("reject", `Adapter for ${d.provider} did not validate the saved payload (${(e as Error).message.slice(0, 160)})`);
        continue;
      }
      out.push({
        strategy: this.id,
        summary: `adapted ${d.provider} to its new API shape (${Object.entries(inf.adapter.aliases ?? {}).map(([to, from]) => `${from} → ${to}`).concat(Object.keys(inf.adapter.coerce ?? {}).map((k) => `${k} as number`)).join(", ")})`,
        rationale: inf.reasons.join("; "),
        apply: async () => {
          writeJsonAt(ctx.cwd, "config/adapters.json", { ...readJsonAt<Adapters>(ctx.cwd, "config/adapters.json", {}), [d.provider]: inf.adapter });
          spawnSync("npx", ["tsx", "scripts/refresh.ts", `--only=${d.provider}`], { cwd: ctx.cwd, stdio: "inherit" });
        },
      });
    }
    return out;
  },
};
