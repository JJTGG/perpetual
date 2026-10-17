/**
 * Hard limits on what an LLM patch may touch. Tests are the oracle, so the model
 * can never edit them; nor workflows, dependencies, or this engine.
 */
export const ALWAYS_FORBIDDEN = [/^tests\//, /^\.github\//, /^engine\//, /^scripts\//, /^package(-lock)?\.json$/, /^vercel\.json$/, /^config\/repair\.json$/];

export type Verdict = { ok: true; files: string[]; changed: number } | { ok: false; reason: string };

export function checkPatch(diff: string, allowedPaths: string[], maxChangedLines: number): Verdict {
  const files = new Set<string>();
  let changed = 0;
  for (const line of diff.split("\n")) {
    const m = line.match(/^(?:\+\+\+|---) (?:[ab]\/)?(.+)$/);
    if (m) {
      if (m[1] !== "/dev/null") files.add(m[1].trim());
      continue;
    }
    if ((line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")) changed++;
  }
  if (files.size === 0) return { ok: false, reason: "patch touches no files" };
  for (const f of files) {
    if (f.includes("..")) return { ok: false, reason: `path escapes the repo: ${f}` };
    if (ALWAYS_FORBIDDEN.some((re) => re.test(f))) return { ok: false, reason: `patch edits a protected path: ${f}` };
    if (!allowedPaths.some((p) => f === p || f.startsWith(p))) return { ok: false, reason: `patch edits ${f}, outside allowed paths (${allowedPaths.join(", ")})` };
  }
  if (changed > maxChangedLines) return { ok: false, reason: `patch changes ${changed} lines (limit ${maxChangedLines})` };
  return { ok: true, files: [...files], changed };
}
