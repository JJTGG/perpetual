// End-to-end repairs in throwaway git repos with a scripted oracle.
import { afterEach, describe, expect, it } from "vitest";
import { repair } from "../../engine/engine";
import { bisectStrategy, parseDiff } from "../../engine/strategies/bisect";
import { quarantineStrategy } from "../../engine/strategies/quarantine";
import { templatesStrategy } from "../../engine/strategies/templates";
import { llmStrategy } from "../../engine/strategies/llm";
import type { Strategy } from "../../engine/types";
import { tempRepo, fakeOracle, makeCtx } from "./helpers";

const filler = (n: number) => Array.from({ length: n }, (_, i) => `export const k${i} = ${i};`).join("\n");
const CALC = `export function label() {\n  return "calc";\n}\n${filler(12)}\nexport function add(a: number, b: number) {\n  return a + b;\n}\n`;

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe("repair engine", () => {
  it("surgically reverts only the breaking hunk and keeps good changes", async () => {
    const r = tempRepo({ "src/calc.ts": CALC, "src/other.ts": "export const x = 1;\n" });
    cleanup = r.cleanup;
    const base = r.git("rev-parse", "HEAD");
    r.write("src/calc.ts", CALC.replace(`return "calc";`, `return "calculator";`).replace("return a + b;", "return a - b;"));
    r.write("src/other.ts", "export const x = 2;\n");
    r.commit("mixed change");
    expect(parseDiff(r.git("diff", base, "--", "src") + "\n")).toHaveLength(3);

    const oracle = fakeOracle(r.dir, { adds: () => r.read("src/calc.ts").includes("return a + b;") });
    const ctx = makeCtx(r.dir, oracle, base);
    const res = await repair(ctx, [bisectStrategy]);

    expect(res.green).toBe(true);
    expect(r.read("src/calc.ts")).toContain(`return "calculator";`); // good change kept
    expect(r.read("src/calc.ts")).toContain("return a + b;"); // bug reverted
    expect(r.read("src/other.ts")).toContain("x = 2"); // unrelated file untouched
    expect(res.actions[0]).toMatch(/reverted src\/calc\.ts hunk 2\/2.*kept the other 2/);
    expect(ctx.trace.toMarkdown()).toContain("**Verified:**");
  });

  it("rolls back a candidate that makes things worse, then tries the next", async () => {
    const r = tempRepo({ "src/calc.ts": CALC });
    cleanup = r.cleanup;
    const base = r.git("rev-parse", "HEAD");
    r.write("src/calc.ts", CALC.replace("return a + b;", "return a - b;"));
    r.commit("bug");
    const oracle = fakeOracle(r.dir, {
      adds: () => r.read("src/calc.ts").includes("return a + b;"),
      compiles: () => !r.read("src/calc.ts").includes("@@garbage"),
    });
    const vandal: Strategy = {
      id: "vandal", kind: "deterministic", applies: () => true,
      propose: async () => [{ strategy: "vandal", summary: "wrote garbage", rationale: "test double", apply: async () => r.write("src/calc.ts", "@@garbage") }],
    };
    const ctx = makeCtx(r.dir, oracle, base);
    const res = await repair(ctx, [vandal, bisectStrategy]);
    expect(res.green).toBe(true);
    expect(res.actions).toHaveLength(1);
    expect(ctx.trace.entries.some((e) => e.step === "reject" && e.text.includes("wrote garbage"))).toBe(true);
    expect(r.read("src/calc.ts")).not.toContain("@@garbage");
  });

  it("quarantines an upstream outage instead of touching code", async () => {
    const r = tempRepo({ "config/health.json": JSON.stringify({ quarantined: {}, updatedAt: null }), "src/a.ts": "export {};\n" });
    cleanup = r.cleanup;
    const oracle = fakeOracle(r.dir, { "live API contracts crypto honours its contract": () => r.read("config/health.json").includes("crypto") });
    const ctx = makeCtx(r.dir, oracle, null);
    ctx.pulse = { at: "now", outcomes: [{ id: "crypto", ok: false, kind: "http", status: 429, error: "crypto: HTTP 429", changes: [] }] };
    r.write("pulse-report.json", JSON.stringify(ctx.pulse));
    const res = await repair(ctx, [bisectStrategy, quarantineStrategy({ outageOnly: false })]);
    expect(res.green).toBe(true);
    expect(res.actions[0]).toContain("quarantined crypto");
    expect(r.read("src/a.ts")).toBe("export {};\n");
  });

  it("applies a fix template at the exact crash site", async () => {
    const r = tempRepo({ "src/q.ts": "export const m = (f: any) => f.properties.mag;\n" });
    cleanup = r.cleanup;
    const oracle = fakeOracle(r.dir, { normalizes: () => r.read("src/q.ts").includes("?.mag") });
    const crash = async () => {
      const v = await oracle();
      if (!v.green) v.report!.testResults[0].assertionResults[0].failureMessages = [`TypeError: Cannot read properties of undefined (reading 'mag')\n    at m (${r.dir}/src/q.ts:1:50)`];
      return v;
    };
    const res = await repair(makeCtx(r.dir, crash, null), [templatesStrategy]);
    expect(res.green).toBe(true);
    expect(r.read("src/q.ts")).toContain("f.properties?.mag");
  });

  it("LLM tier: applies a guarded patch and rejects one that edits tests", async () => {
    const r = tempRepo({ "src/calc.ts": CALC.replace("return a + b;", "return a - b;"), "tests/t.ts": "x\n" });
    cleanup = r.cleanup;
    const good = "```diff\n--- a/src/calc.ts\n+++ b/src/calc.ts\n@@ -17,3 +17,3 @@\n export function add(a: number, b: number) {\n-  return a - b;\n+  return a + b;\n }\n```";
    const evil = "```diff\n--- a/tests/t.ts\n+++ b/tests/t.ts\n@@ -1 +1 @@\n-x\n+y\n```";
    const replies = [evil, good];
    const fetchImpl = async () => Response.json({ content: [{ type: "text", text: replies.shift() }], model: "fake-model" });
    const oracle = fakeOracle(r.dir, { adds: () => r.read("src/calc.ts").includes("return a + b;") });
    const ctx = makeCtx(r.dir, oracle, null, { mode: "llm" });
    const res = await repair(ctx, [llmStrategy(fetchImpl)]);
    expect(res.green).toBe(true);
    expect(r.read("tests/t.ts")).toBe("x\n");
    expect(ctx.trace.entries.some((e) => e.step === "reject" && e.text.includes("protected path"))).toBe(true);
  });

  it("gives up cleanly and leaves the tree unchanged when nothing works", async () => {
    const r = tempRepo({ "src/calc.ts": CALC });
    cleanup = r.cleanup;
    const oracle = fakeOracle(r.dir, { impossible: () => false });
    const ctx = makeCtx(r.dir, oracle, r.git("rev-parse", "HEAD"));
    const res = await repair(ctx, [bisectStrategy, templatesStrategy]);
    expect(res.green).toBe(false);
    expect(r.git("status", "--porcelain")).toBe("");
    expect(ctx.trace.entries.at(-1)?.step).toBe("conclude");
  });
});
