import { describe, expect, it } from "vitest";
import { describeWeatherCode, fmtNumber, fmtPct, relativeTime, trendOf } from "@/lib/format";

describe("format", () => {
  it("formats numbers with grouping", () => {
    expect(fmtNumber(81468)).toBe("81,468");
    expect(fmtNumber(3.14159, 2)).toBe("3.14");
  });
  it("refuses non-finite numbers instead of rendering NaN", () => {
    expect(() => fmtNumber(NaN)).toThrow();
    expect(() => fmtPct(Infinity)).toThrow();
  });
  it("signs percentages", () => {
    expect(fmtPct(1.234)).toBe("+1.23%");
    expect(fmtPct(-0.4)).toBe("-0.40%");
  });
  it("classifies trend with a dead zone", () => {
    expect(trendOf(1)).toBe("up");
    expect(trendOf(-1)).toBe("down");
    expect(trendOf(0.01)).toBe("flat");
  });
  it("describes WMO codes and falls back", () => {
    expect(describeWeatherCode(3)).toBe("Overcast");
    expect(describeWeatherCode(1234)).toBe("Code 1234");
  });
  it("renders relative time", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(relativeTime(new Date("2026-01-01T11:59:30Z"), now)).toBe("30s ago");
    expect(relativeTime(new Date("2026-01-01T11:45:00Z"), now)).toBe("15m ago");
    expect(relativeTime(new Date("2026-01-01T09:00:00Z"), now)).toBe("3h ago");
  });
});
