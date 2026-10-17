import { describe, expect, it } from "vitest";
import { ddmin } from "../../engine/ddmin";

describe("ddmin", () => {
  it("finds the single culprit among many", async () => {
    const units = Array.from({ length: 16 }, (_, i) => i);
    expect(await ddmin(units, async (s) => s.includes(11))).toEqual([11]);
  });
  it("finds a pair that must be reverted together", async () => {
    const units = [0, 1, 2, 3, 4, 5, 6, 7];
    expect(await ddmin(units, async (s) => s.includes(2) && s.includes(6))).toEqual([2, 6]);
  });
  it("stays within its probe budget and returns a passing set", async () => {
    const budget = { remaining: 3 };
    const result = await ddmin(Array.from({ length: 32 }, (_, i) => i), async (s) => s.includes(30), budget);
    expect(budget.remaining).toBe(0);
    expect(result).toContain(30);
  });
  it("is deterministic", async () => {
    const t = async (s: number[]) => s.includes(3) || s.includes(5);
    expect(await ddmin([1, 2, 3, 4, 5, 6], t)).toEqual(await ddmin([1, 2, 3, 4, 5, 6], t));
  });
});
