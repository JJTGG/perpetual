import { describe, expect, it } from "vitest";
import { PROVIDERS } from "@/lib/providers";
import { assertPanel } from "@/lib/pipeline";
import { fixture } from "../helpers";

const now = new Date("2026-10-17T15:00:00Z");

describe.each(PROVIDERS.map((p) => [p.id, p] as const))("provider %s", (id, provider) => {
  it("parses its recorded fixture", () => {
    expect(() => provider.parse(fixture(id))).not.toThrow();
  });
  it("normalizes into a valid panel", () => {
    const panel = provider.normalize(provider.parse(fixture(id)), now);
    expect(panel.id).toBe(id);
    expect(() => assertPanel(panel)).not.toThrow();
  });
  it("rejects a broken contract", () => {
    expect(() => provider.parse({ unexpected: true })).toThrow();
  });
});

describe("assertPanel", () => {
  it("catches NaN leaking into the UI", () => {
    expect(() => assertPanel({ id: "x", title: "X", source: "s", fetchedAt: now.toISOString(), metrics: [{ label: "a", value: "NaN%" }] })).toThrow();
  });
  it("catches empty panels", () => {
    expect(() => assertPanel({ id: "x", title: "X", source: "s", fetchedAt: now.toISOString(), metrics: [] })).toThrow();
  });
});
