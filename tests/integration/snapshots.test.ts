// Validates the data the pulse job just wrote, so a bad fetch can never be committed.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PROVIDERS } from "@/lib/providers";
import { assertPanel } from "@/lib/pipeline";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));

describe("committed data", () => {
  it.each(PROVIDERS.map((p) => p.id))("snapshot %s is valid when present", (id) => {
    const rel = `data/snapshots/${id}.json`;
    if (!existsSync(path.join(root, rel))) return;
    const panel = read(rel);
    expect(panel.id).toBe(id);
    expect(() => assertPanel(panel)).not.toThrow();
  });
  it("state.json has the expected shape", () => {
    const s = read("data/state.json");
    expect(Number.isInteger(s.generation)).toBe(true);
    expect(s.generation).toBeGreaterThanOrEqual(0);
  });
  it("health.json only quarantines known providers", () => {
    const h = read("config/health.json");
    const ids = PROVIDERS.map((p) => p.id);
    for (const k of Object.keys(h.quarantined)) expect(ids).toContain(k);
  });
  it("changelog.md keeps its entry marker", () => {
    expect(readFileSync(path.join(root, "changelog.md"), "utf8")).toContain("<!-- entries -->");
  });
});
