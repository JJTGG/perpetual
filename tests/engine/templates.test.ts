import { describe, expect, it } from "vitest";
import { optionalChaining } from "../../engine/strategies/templates";

const d = { kind: "runtime-error" as const, test: "t", message: "TypeError: Cannot read properties of undefined (reading 'mag')", property: "mag", file: "src/x.ts", line: 1 };

describe("optional-chaining template", () => {
  it("guards the first access, then offers guarding all", () => {
    const v = optionalChaining.rewrite("const m = f.properties.mag + g.properties.mag;", d);
    expect(v.map((x) => x.line)).toEqual([
      "const m = f.properties?.mag + g.properties.mag;",
      "const m = f.properties?.mag + g.properties?.mag;",
    ]);
  });
  it("does not double-guard or touch similarly named props", () => {
    expect(optionalChaining.rewrite("a?.mag + a.magnitude", d)).toEqual([]);
  });
});
