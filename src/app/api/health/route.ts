import { readFile } from "node:fs/promises";
import path from "node:path";
import { readHealth, readState } from "@/lib/fsdata";

async function repairMode(): Promise<string> {
  try {
    return JSON.parse(await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "config/repair.json"), "utf8")).mode ?? "deterministic";
  } catch {
    return "deterministic";
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  const [health, state, mode] = await Promise.all([readHealth(), readState(), repairMode()]);
  return Response.json({ ok: true, ...state, quarantined: health.quarantined, repairMode: mode });
}
