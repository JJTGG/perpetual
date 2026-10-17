import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Ctx, Diagnosis } from "../types";
import { describe } from "../narrate";
import { tryGit } from "../workspace";

export const SYSTEM = `You are the repair tier of a self-healing Next.js + TypeScript service.
A deterministic engine has already diagnosed the failure and tried rule-based fixes.
Return the smallest correct change as ONE unified diff (git apply format, paths prefixed a/ and b/) inside a single \`\`\`diff block.
Never edit tests, workflows, scripts, the engine, or dependencies. Do not explain outside the diff.`;

export function buildPrompt(ds: Diagnosis[], ctx: Ctx, maxChars = 120_000): string {
  const files = new Set<string>(["src/lib/pipeline.ts", "src/lib/types.ts"]);
  for (const d of ds) {
    if ("file" in d && d.file?.startsWith("src/")) files.add(d.file);
    if ("provider" in d) files.add(`src/lib/providers/${d.provider}.ts`);
  }
  const parts = [
    `## Deterministic diagnosis\n${ds.map((d) => `- ${describe(d)}`).join("\n")}`,
    `## Engine trace so far\n${ctx.trace.entries.slice(-12).map((e) => `- ${e.step}: ${e.text}`).join("\n")}`,
  ];
  const raw = ds.find((d) => d.kind === "contract-drift" && d.rawFile);
  if (raw && raw.kind === "contract-drift" && raw.rawFile && existsSync(path.join(ctx.cwd, raw.rawFile)))
    parts.push(`## Raw payload that failed (${raw.provider}, truncated)\n${readFileSync(path.join(ctx.cwd, raw.rawFile), "utf8").slice(0, 6000)}`);
  if (ctx.lastRejection) parts.push(`## Your previous attempt was rejected\n${ctx.lastRejection.slice(0, 4000)}`);
  if (ctx.base) {
    const d = tryGit(ctx.cwd, ["diff", "--no-color", ctx.base, "--", "src"]);
    if (d.ok && d.out) parts.push(`## Changes since last green commit ${ctx.base.slice(0, 7)}\n\`\`\`diff\n${d.out.slice(0, 20_000)}\n\`\`\``);
  }
  for (const f of files) {
    const abs = path.join(ctx.cwd, f);
    if (existsSync(abs)) parts.push(`## ${f}\n\`\`\`ts\n${readFileSync(abs, "utf8")}\n\`\`\``);
  }
  return parts.join("\n\n").slice(0, maxChars);
}
