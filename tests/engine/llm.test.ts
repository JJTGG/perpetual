import { describe, expect, it } from "vitest";
import { buildRequest, complete, extractDiff } from "../../engine/llm/providers";
import { checkPatch } from "../../engine/llm/guardrails";
import { DEFAULT_CONFIG, loadConfig, llmAvailable, type RepairConfig } from "../../engine/config";
import { plan } from "../../engine/plan";

const cfg = (llm: Partial<RepairConfig["llm"]> = {}, mode: RepairConfig["mode"] = "hybrid"): RepairConfig => ({ ...DEFAULT_CONFIG, mode, llm: { ...DEFAULT_CONFIG.llm, ...llm } });

describe("LLM options", () => {
  it("is off in deterministic mode even with a key", () => {
    expect(llmAvailable(cfg({}, "deterministic"), { ANTHROPIC_API_KEY: "k" })).toBe(false);
  });
  it("needs a key for hosted providers and a base URL for local ones", () => {
    expect(llmAvailable(cfg(), {})).toBe(false);
    expect(llmAvailable(cfg(), { ANTHROPIC_API_KEY: "k" })).toBe(true);
    expect(llmAvailable(cfg({ provider: "openai" }), { OPENAI_API_KEY: "k" })).toBe(true);
    expect(llmAvailable(cfg({ provider: "openai-compatible", baseUrl: "http://localhost:11434/v1" }), {})).toBe(true);
  });
  it("lets env override the config file and rejects junk", () => {
    expect(loadConfig("/nonexistent", { REPAIR_MODE: "llm", LLM_PROVIDER: "openai" })).toMatchObject({ mode: "llm", llm: { provider: "openai" } });
    expect(loadConfig("/nonexistent", { REPAIR_MODE: "yolo" }).mode).toBe("deterministic");
  });
  it("orders strategies per mode", () => {
    const ids = (m: RepairConfig["mode"], llm: boolean) => plan(m, { llm, restore: true }).map((s) => s.id);
    expect(ids("deterministic", false)).not.toContain("llm-patch");
    expect(ids("hybrid", true).indexOf("llm-patch")).toBeGreaterThan(ids("hybrid", true).indexOf("hunk-bisect"));
    expect(ids("llm", true).indexOf("llm-patch")).toBeLessThan(ids("llm", true).indexOf("drift-adapter"));
    for (const m of ["deterministic", "hybrid", "llm"] as const) expect(ids(m, true).at(-1)).toBe("restore-last-green");
  });
  it("builds Anthropic and OpenAI-compatible requests at temperature 0", () => {
    const a = buildRequest(cfg(), "sys", "user", { ANTHROPIC_API_KEY: "k" });
    expect(a.url).toBe("https://api.anthropic.com/v1/messages");
    expect(JSON.parse(String(a.init.body))).toMatchObject({ temperature: 0, system: "sys" });
    const o = buildRequest(cfg({ provider: "openai-compatible", baseUrl: "http://localhost:11434/v1/", model: "qwen2.5-coder" }), "s", "u", {});
    expect(o.url).toBe("http://localhost:11434/v1/chat/completions");
    expect((o.init.headers as Record<string, string>).authorization).toBeUndefined();
  });
  it("parses provider responses", async () => {
    const fetchImpl = async () => Response.json({ choices: [{ message: { content: "```diff\n--- a/src/x.ts\n+++ b/src/x.ts\n```" } }], model: "m" });
    const r = await complete(cfg({ provider: "openai" }), "s", "u", fetchImpl, { OPENAI_API_KEY: "k" });
    expect(extractDiff(r.text)).toContain("+++ b/src/x.ts");
  });
  it("guardrails block edits to tests, workflows, deps and oversized patches", () => {
    const patch = (file: string, lines = 1) => `--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n${"-x\n+y\n".repeat(lines)}`;
    const allow = ["src/", "config/adapters.json"];
    expect(checkPatch(patch("src/lib/format.ts"), allow, 80).ok).toBe(true);
    expect(checkPatch(patch("tests/unit/format.test.ts"), allow, 80)).toMatchObject({ ok: false });
    expect(checkPatch(patch(".github/workflows/ci.yml"), allow, 80)).toMatchObject({ ok: false });
    expect(checkPatch(patch("package.json"), allow, 80)).toMatchObject({ ok: false });
    expect(checkPatch(patch("src/a.ts", 50), allow, 80)).toMatchObject({ ok: false });
  });
});
