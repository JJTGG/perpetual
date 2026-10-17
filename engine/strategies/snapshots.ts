import { rmSync } from "node:fs";
import path from "node:path";
import type { Strategy, Diagnosis } from "../types";
import { tryGit } from "../workspace";

export const snapshotStrategy: Strategy = {
  id: "snapshot-restore",
  kind: "deterministic",
  applies: (ds) => ds.some((d) => d.kind === "corrupt-snapshot"),
  async propose(ds, ctx) {
    const bad = ds.filter((d): d is Extract<Diagnosis, { kind: "corrupt-snapshot" }> => d.kind === "corrupt-snapshot");
    return [{
      strategy: this.id,
      summary: `restored ${bad.map((b) => b.file).join(", ")} from git`,
      rationale: `snapshots are derived data; the committed version last passed validation, and if none exists the file is removed so the feed reports "down" instead of rendering garbage`,
      apply: async () => {
        for (const b of bad) if (!tryGit(ctx.cwd, ["checkout", "HEAD", "--", b.file]).ok) rmSync(path.join(ctx.cwd, b.file), { force: true });
      },
    }];
  },
};
