import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const ROOT = process.cwd();
export const p = (...s: string[]) => path.join(ROOT, ...s);

export async function readJson<T>(rel: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(p(rel), "utf8")) as T; } catch { return fallback; }
}
export async function writeJson(rel: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(p(rel)), { recursive: true });
  await writeFile(p(rel), JSON.stringify(data, null, 2) + "\n");
}

export type ProviderOutcome = { id: string; ok: boolean; error?: string; changes: string[] };
export type PulseReport = { at: string; outcomes: ProviderOutcome[] };
export type HealReport = { actions: string[]; codeRestored: boolean };

/** Vitest JSON reporter (subset). */
export type TestReport = {
  numPassedTests: number;
  numFailedTests: number;
  success: boolean;
  testResults: { name: string; status: string; assertionResults: { fullName: string; status: string; failureMessages: string[] }[] }[];
};

export function setOutput(name: string, value: string) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) return import("node:fs").then((fs) => fs.appendFileSync(file, `${name}=${value}\n`));
  console.log(`::output ${name}=${value}`);
}
