import { readFileSync } from "node:fs";
import path from "node:path";
import { PROVIDERS } from "@/lib/providers";
import type { FetchLike } from "@/lib/pipeline";

export function fixture(id: string): unknown {
  return JSON.parse(readFileSync(path.join(__dirname, "fixtures", `${id}.json`), "utf8"));
}

/** A fetch stub that serves fixtures by provider URL; overrides let tests inject failures. */
export function fixtureFetch(overrides: Record<string, () => Response | Promise<Response>> = {}): FetchLike {
  return async (url: string) => {
    const p = PROVIDERS.find((x) => x.url === url);
    if (!p) throw new Error(`unexpected url ${url}`);
    if (overrides[p.id]) return overrides[p.id]();
    return new Response(JSON.stringify(fixture(p.id)), { status: 200, headers: { "content-type": "application/json" } });
  };
}
