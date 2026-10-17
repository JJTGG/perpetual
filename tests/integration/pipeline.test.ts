import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadPanels } from "@/lib/pipeline";
import { PROVIDERS } from "@/lib/providers";
import { fixture, fixtureFetch } from "../helpers";

let dir: string;
const now = new Date("2026-10-17T15:00:00Z");

function seedSnapshot(id: string) {
  const p = PROVIDERS.find((x) => x.id === id)!;
  const panel = p.normalize(p.parse(fixture(id)), new Date("2026-10-17T14:45:00Z"));
  writeFileSync(path.join(dir, "data/snapshots", `${id}.json`), JSON.stringify(panel));
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "perpetual-"));
  mkdirSync(path.join(dir, "data/snapshots"), { recursive: true });
  mkdirSync(path.join(dir, "config"), { recursive: true });
  writeFileSync(path.join(dir, "config/health.json"), JSON.stringify({ quarantined: {}, updatedAt: null }));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("loadPanels (fetch → validate → fallback)", () => {
  it("returns every provider live when APIs are healthy", async () => {
    const results = await loadPanels(fixtureFetch(), now);
    expect(results.map((r) => r.status)).toEqual(PROVIDERS.map(() => "live"));
  });

  it("falls back to the last-good snapshot on HTTP errors", async () => {
    seedSnapshot("crypto");
    const results = await loadPanels(fixtureFetch({ crypto: () => new Response("rate limited", { status: 429 }) }), now);
    const crypto = results.find((r) => r.status !== "down" && r.panel.id === "crypto");
    expect(crypto?.status).toBe("stale");
    if (crypto?.status === "stale") expect(crypto.reason).toContain("429");
  });

  it("falls back when the API changes its contract", async () => {
    seedSnapshot("weather");
    const results = await loadPanels(fixtureFetch({ weather: () => Response.json({ current: { temperature: "hot" } }) }), now);
    expect(results.find((r) => r.status !== "down" && r.panel.id === "weather")?.status).toBe("stale");
  });

  it("reports down (never throws) when there is no snapshot", async () => {
    const results = await loadPanels(fixtureFetch({ fx: () => { throw new Error("ECONNRESET"); } }), now);
    const fx = results.find((r) => r.status === "down");
    expect(fx).toMatchObject({ status: "down", id: "fx" });
  });

  it("skips quarantined providers entirely", async () => {
    seedSnapshot("quakes");
    writeFileSync(path.join(dir, "config/health.json"), JSON.stringify({ quarantined: { quakes: { since: now.toISOString(), reason: "HTTP 500" } }, updatedAt: null }));
    const spy = vi.fn(fixtureFetch());
    const results = await loadPanels(spy, now);
    expect(spy.mock.calls.map((c) => c[0])).not.toContain(PROVIDERS.find((p) => p.id === "quakes")!.url);
    expect(results.find((r) => r.status !== "down" && r.panel.id === "quakes")?.status).toBe("stale");
  });

  it("ignores corrupted snapshots", async () => {
    writeFileSync(path.join(dir, "data/snapshots/crypto.json"), JSON.stringify({ id: "crypto", metrics: [] }));
    const results = await loadPanels(fixtureFetch({ crypto: () => new Response("", { status: 500 }) }), now);
    expect(results.find((r) => r.status === "down")).toMatchObject({ id: "crypto" });
  });
});
