/** Deterministic string similarity used to match drifted field names. */
export function tokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** 0..1. Token overlap (with prefix matching: temp ≈ temperature) blended with edit distance. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const ta = tokens(a), tb = tokens(b);
  const match = (x: string, y: string) => x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)));
  const shared = ta.filter((x) => tb.some((y) => match(x, y))).length;
  const tokenScore = (2 * shared) / Math.max(1, ta.length + tb.length);
  const lev = 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / Math.max(a.length, b.length);
  return Math.round((0.6 * tokenScore + 0.4 * lev) * 1000) / 1000;
}
