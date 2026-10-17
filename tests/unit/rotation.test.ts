import { describe, expect, it } from "vitest";
import { getRotation, ROTATION_MS, THEMES, LAYOUTS } from "@/lib/rotation";
import { PROVIDERS } from "@/lib/providers";

const t0 = new Date("2026-10-17T00:00:00Z");

describe("rotation", () => {
  it("is deterministic for the same instant", () => {
    expect(getRotation(t0)).toEqual(getRotation(new Date(t0)));
  });
  it("changes theme every slot and never stabilises", () => {
    const seen = new Set<string>();
    for (let i = 0; i < THEMES.length; i++) seen.add(getRotation(new Date(t0.getTime() + i * ROTATION_MS)).theme.id);
    expect(seen.size).toBe(THEMES.length);
    const a = getRotation(t0), b = getRotation(new Date(t0.getTime() + ROTATION_MS));
    expect(a.theme.id).not.toBe(b.theme.id);
  });
  it("cycles through every layout", () => {
    const seen = new Set<string>();
    for (let i = 0; i < LAYOUTS.length * 2; i++) seen.add(getRotation(new Date(t0.getTime() + i * ROTATION_MS)).layout);
    expect(seen.size).toBe(LAYOUTS.length);
  });
  it("orders every provider exactly once with the featured one first", () => {
    const r = getRotation(t0);
    expect(r.order[0]).toBe(r.featured);
    expect([...r.order].sort()).toEqual(PROVIDERS.map((p) => p.id).sort());
  });
  it("never features a quarantined provider while others are healthy", () => {
    for (let i = 0; i < 20; i++) {
      const r = getRotation(new Date(t0.getTime() + i * ROTATION_MS), ["crypto", "fx"]);
      expect(["crypto", "fx"]).not.toContain(r.featured);
    }
  });
  it("reports slot boundaries", () => {
    const r = getRotation(new Date(t0.getTime() + 1000));
    expect(Date.parse(r.nextAt) - Date.parse(r.startedAt)).toBe(ROTATION_MS);
    expect(Date.parse(r.startedAt)).toBeLessThanOrEqual(t0.getTime() + 1000);
  });
  it("rejects invalid dates", () => {
    expect(() => getRotation(new Date("nope"))).toThrow();
  });
  it("has readable theme contrast tokens", () => {
    for (const t of THEMES) expect(t.text).not.toBe(t.bg);
  });
});
