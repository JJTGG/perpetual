/**
 * Delta debugging (Zeller's ddmin): find a 1-minimal subset of `units` for which
 * `test` holds. Deterministic (fixed partitioning, memoised) and budgeted.
 */
export class ProbeBudgetExceeded extends Error {}

export async function ddmin<T>(units: T[], test: (subset: T[]) => Promise<boolean>, budget = { remaining: 24 }): Promise<T[]> {
  const cache = new Map<string, boolean>();
  const index = new Map(units.map((u, i) => [u, i] as const));
  const keyOf = (s: T[]) => s.map((u) => index.get(u)).join(",");
  const probe = async (s: T[]) => {
    const k = keyOf(s);
    if (cache.has(k)) return cache.get(k)!;
    if (budget.remaining <= 0) throw new ProbeBudgetExceeded();
    budget.remaining--;
    const r = await test(s);
    cache.set(k, r);
    return r;
  };

  let c = [...units];
  let n = 2;
  try {
    while (c.length >= 2) {
      const size = Math.ceil(c.length / n);
      const parts: T[][] = [];
      for (let i = 0; i < c.length; i += size) parts.push(c.slice(i, i + size));
      let reduced = false;
      for (const part of parts) {
        if (await probe(part)) { c = part; n = 2; reduced = true; break; }
      }
      if (!reduced && parts.length > 2) {
        for (const part of parts) {
          const comp = c.filter((u) => !part.includes(u));
          if (await probe(comp)) { c = comp; n = Math.max(n - 1, 2); reduced = true; break; }
        }
      }
      if (!reduced) {
        if (n >= c.length) break;
        n = Math.min(c.length, n * 2);
      }
    }
  } catch (e) {
    if (!(e instanceof ProbeBudgetExceeded)) throw e;
  }
  return c;
}
