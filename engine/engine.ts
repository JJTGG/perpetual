/**
 * The repair loop: observe → diagnose → hypothesize → act → verify, repeated
 * until green or out of ideas. A candidate survives only if the oracle shows it
 * strictly reduces failures without introducing new ones; otherwise it is rolled
 * back byte-for-byte.
 */
import type { PulseReport } from "../scripts/lib";
import type { Ctx, Strategy, Verdict } from "./types";
import { diagnose } from "./diagnose";
import { describe } from "./narrate";
import { improves } from "./oracle";
import { Checkpoint, readJsonAt } from "./workspace";

export type RepairResult = { green: boolean; actions: string[]; codeRestored: boolean; verdict: Verdict };

const short = (v: Verdict) => (v.green ? "all checks pass" : `${v.failing.length} failing (${v.failing.slice(0, 3).join(", ")}${v.failing.length > 3 ? ", …" : ""})`);

export async function repair(ctx: Ctx, strategies: Strategy[]): Promise<RepairResult> {
  const actions: string[] = [];
  let codeRestored = false;
  let verdict = await ctx.oracle();
  ctx.trace.add("observe", short(verdict));
  if (verdict.green) {
    ctx.trace.add("conclude", "nothing to repair");
    return { green: true, actions, codeRestored, verdict };
  }

  for (let round = 1; round <= ctx.config.maxRounds; round++) {
    const pulse = readJsonAt<PulseReport | null>(ctx.cwd, "pulse-report.json", ctx.pulse);
    const ds = diagnose(ctx.cwd, pulse, verdict.report, verdict.tsc);
    if (ds.length === 0) ctx.trace.add("diagnose", "failures do not match any known signature; only generic strategies apply");
    for (const d of ds) ctx.trace.add("diagnose", describe(d));

    let progressed = false;
    for (const s of strategies) {
      if (ds.length > 0 && !s.applies(ds)) continue;
      if (ctx.probes.used >= ctx.config.maxProbes) break;
      let candidates;
      try {
        candidates = await s.propose(ds, ctx);
      } catch (e) {
        ctx.trace.add("reject", `${s.id} could not propose a fix: ${(e as Error).message.slice(0, 200)}`);
        continue;
      }
      for (const c of candidates) {
        if (ctx.probes.used >= ctx.config.maxProbes) break;
        ctx.trace.add("hypothesize", `[${c.strategy}] ${c.rationale}`);
        const cp = new Checkpoint(ctx.cwd);
        try {
          await c.apply();
        } catch (e) {
          cp.restore();
          ctx.lastRejection = `${c.summary}: ${(e as Error).message}`;
          ctx.trace.add("reject", ctx.lastRejection.slice(0, 300));
          continue;
        }
        ctx.probes.used++;
        const after = await ctx.oracle();
        if (improves(verdict, after)) {
          ctx.trace.add("act", c.summary);
          ctx.trace.add("verify", `${short(verdict)} → ${short(after)}`);
          actions.push(c.summary);
          codeRestored ||= Boolean(c.restoresCode);
          verdict = after;
          progressed = true;
          break;
        }
        cp.restore();
        const msgs = (after.report?.testResults ?? []).flatMap((t) => t.assertionResults.filter((a) => a.status === "failed").map((a) => `${a.fullName}: ${a.failureMessages[0]?.split("\n")[0]}`));
        ctx.lastRejection = `${c.summary} → ${short(after)}\n${msgs.slice(0, 5).join("\n")}\n${after.tsc.slice(0, 800)}`;
        ctx.trace.add("reject", `${c.summary} → ${short(after)}; rolled back`);
      }
      if (progressed) break;
    }
    if (verdict.green) {
      ctx.trace.add("conclude", `repaired in ${round} round(s) with ${ctx.probes.used} verification run(s): ${actions.join("; ")}`);
      return { green: true, actions, codeRestored, verdict };
    }
    if (!progressed) break;
  }
  ctx.trace.add("conclude", `could not reach green (${short(verdict)}) after ${ctx.probes.used} verification run(s); nothing will be committed`);
  return { green: false, actions, codeRestored, verdict };
}
