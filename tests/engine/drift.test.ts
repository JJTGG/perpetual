import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { inferAdapter, normalizePath } from "../../engine/drift";
import { applyAdapter } from "@/lib/adapters";
import { weather } from "@/lib/providers/weather";
import { quakes } from "@/lib/providers/quakes";
import { crypto } from "@/lib/providers/crypto";
import { panelFromRaw } from "@/lib/pipeline";
import { fixture } from "../helpers";
import type { ContractIssue } from "../../scripts/lib";

const issuesOf = (fn: () => unknown): ContractIssue[] => {
  try { fn(); } catch (e) { if (e instanceof ZodError) return e.issues.map((i) => ({ path: i.path as (string | number)[], code: i.code, expected: (i as any).expected, message: i.message })); }
  throw new Error("expected a ZodError");
};

describe("drift inference", () => {
  it("normalises array indexes", () => {
    expect(normalizePath(["features", 3, "properties", "mag"])).toBe("features[].properties.mag");
  });

  it("recovers a renamed field (weather: temperature_2m → temp_2m)", () => {
    const raw: any = structuredClone(fixture("weather"));
    raw.current.temp_2m = raw.current.temperature_2m;
    delete raw.current.temperature_2m;
    const inf = inferAdapter(issuesOf(() => weather.parse(raw)), raw, weather.schema);
    expect(inf.adapter.aliases).toEqual({ "current.temperature_2m": "temp_2m" });
    expect(inf.unresolved).toEqual([]);
    expect(() => panelFromRaw(weather, raw, { weather: inf.adapter }, new Date())).not.toThrow();
  });

  it("recovers renamed fields inside arrays (quakes: mag → magnitude)", () => {
    const raw: any = structuredClone(fixture("quakes"));
    for (const f of raw.features) { f.properties.magnitude = f.properties.mag; delete f.properties.mag; }
    const inf = inferAdapter(issuesOf(() => quakes.parse(raw)), raw, quakes.schema);
    expect(inf.adapter.aliases).toEqual({ "features[].properties.mag": "magnitude" });
    const fixed = applyAdapter(raw, inf.adapter) as any;
    expect(typeof fixed.features[0].properties.mag).toBe("number");
  });

  it("coerces numbers that started arriving as strings", () => {
    const raw: any = structuredClone(fixture("crypto"));
    raw.bitcoin.usd = String(raw.bitcoin.usd);
    const inf = inferAdapter(issuesOf(() => crypto.parse(raw)), raw, crypto.schema);
    expect(inf.adapter.coerce).toEqual({ "bitcoin.usd": "number" });
    expect(() => crypto.parse(applyAdapter(raw, inf.adapter))).not.toThrow();
  });

  it("refuses to guess when nothing similar exists", () => {
    const raw: any = structuredClone(fixture("weather"));
    delete raw.current.temperature_2m;
    raw.current.zzz = 1;
    const inf = inferAdapter(issuesOf(() => weather.parse(raw)), raw, weather.schema);
    expect(inf.adapter.aliases).toBeUndefined();
    expect(inf.unresolved[0]).toContain("current.temperature_2m");
  });

  it("never aliases from a key the schema already uses", () => {
    const raw: any = structuredClone(fixture("weather"));
    delete raw.current.relative_humidity_2m; // only wind_speed_10m/temperature_2m etc. remain, all declared
    const inf = inferAdapter(issuesOf(() => weather.parse(raw)), raw, weather.schema);
    expect(Object.values(inf.adapter.aliases ?? {})).not.toContain("temperature_2m");
  });

  it("is deterministic", () => {
    const raw: any = structuredClone(fixture("weather"));
    raw.current.temp_2m = raw.current.temperature_2m;
    delete raw.current.temperature_2m;
    const issues = issuesOf(() => weather.parse(raw));
    expect(inferAdapter(issues, raw, weather.schema)).toEqual(inferAdapter(issues, raw, weather.schema));
  });
});
