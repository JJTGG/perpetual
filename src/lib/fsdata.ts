import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Panel } from "./types";

// turbopackIgnore: files are traced explicitly via outputFileTracingIncludes in next.config.ts
const root = () => process.cwd();

export type Health = { quarantined: Record<string, { since: string; reason: string }>; updatedAt: string | null };
export type State = { generation: number; lastRunAt: string | null; lastDeploySlot: number | null; lastGreenSha: string | null };

async function readJson<T>(rel: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(/*turbopackIgnore: true*/ root(), rel), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export const readHealth = () => readJson<Health>("config/health.json", { quarantined: {}, updatedAt: null });
export const readState = () => readJson<State>("data/state.json", { generation: 0, lastRunAt: null, lastDeploySlot: null, lastGreenSha: null });
export const readSnapshot = (id: string) => readJson<Panel | null>(`data/snapshots/${id}.json`, null);

export async function readChangelog(): Promise<string> {
  try {
    return await readFile(path.join(/*turbopackIgnore: true*/ root(), "changelog.md"), "utf8");
  } catch {
    return "";
  }
}
