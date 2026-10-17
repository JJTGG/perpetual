import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureFetch } from "../helpers";
import { GET as feed } from "@/app/api/feed/[provider]/route";
import { GET as rotation } from "@/app/api/rotation/route";
import { GET as health } from "@/app/api/health/route";

beforeEach(() => { vi.stubGlobal("fetch", fixtureFetch()); });
afterEach(() => { vi.unstubAllGlobals(); });

const ctx = (provider: string) => ({ params: Promise.resolve({ provider }) });

describe("API routes", () => {
  it("serves a live feed", async () => {
    const res = await feed(new Request("http://x/api/feed/weather"), ctx("weather"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("live");
  });
  it("404s on unknown feeds and lists the available ones", async () => {
    const res = await feed(new Request("http://x/api/feed/nope"), ctx("nope"));
    expect(res.status).toBe(404);
    expect((await res.json()).available).toContain("fx");
  });
  it("exposes the current rotation", async () => {
    const body = await (await rotation()).json();
    expect(body).toHaveProperty("theme.id");
    expect(body).toHaveProperty("nextAt");
  });
  it("exposes pipeline health", async () => {
    const body = await (await health()).json();
    expect(body.ok).toBe(true);
    expect(typeof body.generation).toBe("number");
  });
});
