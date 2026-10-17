import { spawnSync } from "node:child_process";
import type { Strategy } from "../types";
import { git, tryGit } from "../workspace";

/** Last resort: put code, tests and dependencies back exactly as they were at the last green commit. */
export const restoreStrategy: Strategy = {
  id: "restore-last-green",
  kind: "deterministic",
  applies: () => true,
  async propose(_ds, ctx) {
    if (!ctx.base) return [];
    const head = tryGit(ctx.cwd, ["rev-parse", "HEAD"]);
    const changed = tryGit(ctx.cwd, ["diff", "--name-only", ctx.base, "--", "src", "tests", "package.json", "package-lock.json"]);
    if (!head.ok || !changed.ok || !changed.out) return [];
    return [{
      strategy: this.id,
      restoresCode: true,
      summary: `restored src/, tests/ and dependencies to last green commit ${ctx.base.slice(0, 7)}`,
      rationale: `no narrower fix worked; ${ctx.base.slice(0, 7)} is the most recent state that passed the full pulse`,
      apply: async () => {
        const lockBefore = tryGit(ctx.cwd, ["hash-object", "package-lock.json"]).out;
        git(ctx.cwd, ["checkout", ctx.base!, "--", "src", "tests", "package.json", "package-lock.json"]);
        if (tryGit(ctx.cwd, ["hash-object", "package-lock.json"]).out !== lockBefore) spawnSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: ctx.cwd, stdio: "inherit" });
      },
    }];
  },
};
