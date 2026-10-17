/**
 * Optional LLM repair tier. Runs only when ANTHROPIC_API_KEY is set as a repo
 * secret. Sends failing test output + the implicated source files to the model,
 * asks for a unified diff, and applies it. The workflow then re-runs the full
 * suite; the patch is kept only if everything is green.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { readJson, writeJson, type HealReport, type TestReport } from "./lib";

const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.log("ai-fix: no ANTHROPIC_API_KEY, skipping"); process.exit(0); }

const tests = await readJson<TestReport | null>("test-report.json", null);
const failures = (tests?.testResults ?? []).flatMap((t) =>
  t.assertionResults.filter((a) => a.status === "failed").map((a) => `${t.name}\n${a.fullName}\n${a.failureMessages.join("\n").slice(0, 2000)}`),
);
if (failures.length === 0) { console.log("ai-fix: no failures to fix"); process.exit(0); }

const files = execSync("git ls-files src tests scripts", { encoding: "utf8" }).split("\n").filter((f) => /\.(ts|tsx)$/.test(f));
const context = files.filter(existsSync).map((f) => `--- ${f}\n${readFileSync(f, "utf8")}`).join("\n\n").slice(0, 150_000);

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({
    model: process.env.AI_FIX_MODEL ?? "claude-sonnet-4-5",
    max_tokens: 8000,
    messages: [{
      role: "user",
      content: `You maintain a Next.js + TypeScript repo. These tests fail:\n\n${failures.join("\n\n")}\n\nRepository files:\n\n${context}\n\nFix the application code (not the tests, unless a test is clearly wrong). Reply with ONLY a unified diff (git apply format) inside one \`\`\`diff block.`,
    }],
  }),
});
if (!res.ok) { console.log(`ai-fix: API error ${res.status}`); process.exit(0); }
const body = (await res.json()) as { content: { type: string; text?: string }[] };
const text = body.content.map((c) => c.text ?? "").join("");
const diff = text.match(/```diff\n([\s\S]*?)```/)?.[1];
if (!diff) { console.log("ai-fix: model returned no diff"); process.exit(0); }
writeFileSync("ai-fix.patch", diff);
try {
  execSync("git apply --whitespace=fix ai-fix.patch", { stdio: "inherit" });
  const heal = await readJson<HealReport>("heal-report.json", { actions: [], codeRestored: false });
  heal.actions.push(`AI patch applied for: ${failures.map((f) => f.split("\n")[1]).join("; ").slice(0, 300)}`);
  await writeJson("heal-report.json", heal);
  console.log("ai-fix: patch applied");
} catch {
  console.log("ai-fix: patch did not apply cleanly");
}
