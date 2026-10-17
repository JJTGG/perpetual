import { describe, expect, it } from "vitest";
import { similarity, tokens, levenshtein } from "../../engine/similarity";

describe("similarity", () => {
  it("tokenises snake, kebab and camel case", () => {
    expect(tokens("temperature_2m")).toEqual(["temperature", "2m"]);
    expect(tokens("usd24hChange")).toEqual(["usd24h", "change"]);
  });
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
  it("ranks plausible renames above unrelated keys", () => {
    expect(similarity("temperature_2m", "temp_2m")).toBeGreaterThan(similarity("temperature_2m", "wind_speed_10m"));
    expect(similarity("mag", "magnitude")).toBeGreaterThan(0.45);
    expect(similarity("place", "elevation")).toBeLessThan(0.45);
  });
  it("is symmetric and deterministic", () => {
    expect(similarity("abc_def", "def_abc")).toBe(similarity("def_abc", "abc_def"));
  });
});
