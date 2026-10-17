/** Optional LLM tier. Same contract as every other strategy: propose → guardrails → oracle → keep or roll back. */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Strategy, Candidate } from "../types";
import { isCodeDiagnosis } from "../diagnose";
import { complete, extractDiff, type Fetch } from "../llm/providers";
import { checkPatch } from "../llm/guardrails";
import { buildPrompt, SYSTEM } from "../llm/prompt";
import { tryGit } from "../workspace";

export function llmStrategy(fetchImpl: Fetch = fetch): Strategy {
  return {
    id: "llm-patch",
    kind: "llm",
    applies: (ds) => ds.some((d) => isCodeDiagnosis(d) || d.kind === "contract-drift"),
    async propose(ds, ctx) {
      const { provider, model, maxAttempts } = ctx.config.llm;
      return Array.from({ length: maxAttempts }, (_, i): Candidate => ({
        strategy: this.id,
        summary: `applied ${provider}/${model} patch (attempt ${i + 1}/${maxAttempts})`,
        rationale: `rule-based strategies could not fully resolve the failure; asking ${provider}/${model} for a minimal patch constrained to ${ctx.config.llm.allowedPaths.join(", ")}`,
        apply: async () => {
          const res = await complete(ctx.config, SYSTEM, buildPrompt(ds, ctx), fetchImpl);
          const diff = extractDiff(res.text);
          if (!diff) throw new Error("model returned no diff");
          const guard = checkPatch(diff, ctx.config.llm.allowedPaths, ctx.config.llm.maxChangedLines);
          if (!guard.ok) throw new Error(`guardrail: ${guard.reason}`);
          mkdirSync(path.join(ctx.cwd, ".pulse"), { recursive: true });
          writeFileSync(path.join(ctx.cwd, ".pulse/llm.patch"), diff);
          const check = tryGit(ctx.cwd, ["apply", "--check", "--whitespace=nowarn", "-"], diff);
          if (!check.ok) throw new Error(`patch does not apply: ${check.out.slice(0, 200)}`);
          tryGit(ctx.cwd, ["apply", "--whitespace=nowarn", "-"], diff);
          ctx.trace.add("act", `${res.model} proposed a ${guard.changed}-line patch to ${guard.files.join(", ")}; passed guardrails`);
        },
      }));
    },
  };
}
