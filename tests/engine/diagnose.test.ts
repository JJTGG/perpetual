import { describe, expect, it } from "vitest";
import { fromPulse, fromTests, fromTsc } from "../../engine/diagnose";
import { describe as narrate } from "../../engine/narrate";

const cwd = "/repo";
const report = (name: string, msg: string) => ({
  numPassedTests: 0, numFailedTests: 1, success: false,
  testResults: [{ name: `${cwd}/tests/unit/x.test.ts`, status: "failed", assertionResults: [{ fullName: name, status: "failed", failureMessages: [msg] }] }],
});

describe("diagnose", () => {
  it("separates outages from contract drift", () => {
    const ds = fromPulse({ at: "", outcomes: [
      { id: "crypto", ok: false, kind: "http", status: 429, error: "crypto: HTTP 429", changes: [] },
      { id: "weather", ok: false, kind: "contract", error: "drift", issues: [{ path: ["current", "temperature_2m"], code: "invalid_type", expected: "number", message: "Invalid input: expected number, received undefined" }], rawFile: ".pulse/raw/weather.json", changes: [] },
      { id: "fx", ok: true, changes: [] },
    ] });
    expect(ds.map((d) => d.kind)).toEqual(["outage", "contract-drift"]);
    expect(narrate(ds[0])).toContain("upstream problem");
  });
  it("extracts property and source location from runtime errors", () => {
    const [d] = fromTests(report("renders", "TypeError: Cannot read properties of undefined (reading 'mag')\n    at normalize (/repo/src/lib/providers/quakes.ts:41:23)"), cwd, new Set());
    expect(d).toMatchObject({ kind: "runtime-error", property: "mag", file: "src/lib/providers/quakes.ts", line: 41 });
  });
  it("classifies plain assertion failures", () => {
    const [d] = fromTests(report("signs percentages", "AssertionError: expected '+1.234%' to be '+1.23%'\n at /repo/tests/unit/format.test.ts:18:5"), cwd, new Set());
    expect(d.kind).toBe("assertion");
  });
  it("ignores live-contract failures for feeds already diagnosed upstream", () => {
    expect(fromTests(report("live API contracts crypto honours its contract", "Error: crypto: HTTP 429"), cwd, new Set(["crypto"]))).toEqual([]);
  });
  it("treats rate limits and network errors in live checks as outages", () => {
    expect(fromTests(report("live API contracts crypto honours its contract", "Error: crypto: HTTP 429\n at /repo/src/lib/pipeline.ts:23:5"), cwd, new Set())).toEqual([
      { kind: "outage", provider: "crypto", detail: "HTTP 429" },
    ]);
    expect(fromTests(report("live API contracts fx honours its contract", "TypeError: fetch failed"), cwd, new Set())[0]).toMatchObject({ kind: "outage", provider: "fx" });
  });
  it("parses tsc output", () => {
    expect(fromTsc("src/lib/format.ts(12,3): error TS2322: Type 'string' is not assignable to type 'number'.")).toEqual([
      { kind: "type-error", file: "src/lib/format.ts", line: 12, message: "TS2322: Type 'string' is not assignable to type 'number'." },
    ]);
  });
});
