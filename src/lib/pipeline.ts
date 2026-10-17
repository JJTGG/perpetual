import type { Panel, PanelResult, Provider } from "./types";
import { PROVIDERS } from "./providers";
import { readAdapters, readHealth, readSnapshot } from "./fsdata";
import { applyAdapter, type Adapters } from "./adapters";

export type FetchLike = (url: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>;

export const FETCH_TIMEOUT_MS = 8000;

export class HttpError extends Error {
  constructor(public provider: string, public status: number) {
    super(`${provider}: HTTP ${status}`);
  }
}

/** Fetch the raw JSON body. Throws HttpError / network errors. */
export async function fetchRaw(p: Provider<any>, fetchImpl: FetchLike = fetch): Promise<unknown> {
  const res = await fetchImpl(p.url, {
    headers: { accept: "application/json", "user-agent": "perpetual-app/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new HttpError(p.id, res.status);
  return res.json();
}

/** Adapt → validate → normalize → invariant-check. Throws ZodError or Error. */
export function panelFromRaw(p: Provider<any>, json: unknown, adapters: Adapters, now: Date): Panel {
  const raw = p.parse(applyAdapter(json, adapters[p.id]));
  const panel = p.normalize(raw, now);
  assertPanel(panel);
  return panel;
}

/** Fetch + validate + normalize one provider. Throws on any failure. */
export async function fetchPanel(p: Provider<any>, fetchImpl: FetchLike = fetch, now = new Date(), adapters?: Adapters): Promise<Panel> {
  const json = await fetchRaw(p, fetchImpl);
  return panelFromRaw(p, json, adapters ?? (await readAdapters()), now);
}

/** Runtime invariant check shared by the app, the pulse job and the tests. */
export function assertPanel(panel: Panel): void {
  if (!panel.id || !panel.title) throw new Error("panel missing id/title");
  if (Number.isNaN(Date.parse(panel.fetchedAt))) throw new Error(`${panel.id}: bad fetchedAt`);
  if (!Array.isArray(panel.metrics) || panel.metrics.length === 0) throw new Error(`${panel.id}: no metrics`);
  for (const m of panel.metrics) {
    if (!m.label || !m.value || /NaN|undefined|Infinity/.test(m.value)) throw new Error(`${panel.id}: bad metric ${m.label}=${m.value}`);
  }
  if (panel.series && panel.series.some((n) => !Number.isFinite(n))) throw new Error(`${panel.id}: non-finite series`);
}

/** Never throws: live → last-good snapshot → down. */
export async function loadPanels(fetchImpl: FetchLike = fetch, now = new Date()): Promise<PanelResult[]> {
  const [health, adapters] = await Promise.all([readHealth(), readAdapters()]);
  return Promise.all(
    PROVIDERS.map(async (p): Promise<PanelResult> => {
      const quarantine = health.quarantined[p.id];
      if (!quarantine) {
        try {
          return { status: "live", panel: await fetchPanel(p, fetchImpl, now, adapters) };
        } catch (err) {
          return fallback(p, err instanceof Error ? err.message : String(err));
        }
      }
      return fallback(p, `quarantined by healer: ${quarantine.reason}`);
    }),
  );
}

async function fallback(p: Provider<any>, reason: string): Promise<PanelResult> {
  const snap = await readSnapshot(p.id);
  if (snap) {
    try {
      assertPanel(snap);
      return { status: "stale", panel: snap, reason };
    } catch {
      /* corrupted snapshot falls through */
    }
  }
  return { status: "down", id: p.id, title: p.title, reason };
}
