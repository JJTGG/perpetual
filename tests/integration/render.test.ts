import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fixtureFetch } from "../helpers";
import { THEMES } from "@/lib/rotation";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => ({ $$typeof: Symbol.for("react.transitional.element"), type: "a", key: null, ref: null, props: { href, children, ...rest } }) }));

// Isolated data dir so the real quarantine/state files never leak into assertions.
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "perpetual-render-"));
  mkdirSync(path.join(dir, "config"), { recursive: true });
  mkdirSync(path.join(dir, "data"), { recursive: true });
  writeFileSync(path.join(dir, "config/health.json"), JSON.stringify({ quarantined: {}, updatedAt: null }));
  writeFileSync(path.join(dir, "data/state.json"), JSON.stringify({ generation: 3, lastRunAt: null, lastDeploySlot: null, lastGreenSha: null }));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  vi.stubGlobal("fetch", fixtureFetch());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); rmSync(dir, { recursive: true, force: true }); });

describe("home page render", () => {
  it("renders every panel live with no NaN/undefined leaking", async () => {
    const { default: Home } = await import("@/app/page");
    const html = renderToStaticMarkup(await Home());
    for (const id of ["weather", "quakes", "crypto", "fx"]) expect(html).toContain(`data-panel="${id}"`);
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
    expect(html).toContain("4/4 feeds live");
  });

  it("applies a different theme in the next rotation slot", async () => {
    const { default: Home } = await import("@/app/page");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-17T00:00:01Z"));
    const a = renderToStaticMarkup(await Home()).match(/data-theme="([^"]+)"/)?.[1];
    vi.setSystemTime(new Date("2026-10-17T03:00:01Z"));
    const b = renderToStaticMarkup(await Home()).match(/data-theme="([^"]+)"/)?.[1];
    expect(THEMES.map((t) => t.id)).toContain(a);
    expect(a).not.toBe(b);
  });
});
