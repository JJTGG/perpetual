import type { Panel, PanelResult, Provider } from "./types";
import { PROVIDERS } from "./providers";
import { readHealth, readSnapshot } from "./fsdata";

export type FetchLike = (url: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>;

export const FETCH_TIMEOUT_MS = 8000;

/** Fetch + validate + normalize one provider. Throws on any failure. */
export async function fetchPanel(p: Provider<any>, fetchImpl: FetchLike = fetch, now = new Date()): Promise<Panel> {
  const res = await fetchImpl(p.url, {
    headers: { accept: "application/json", "user-agent": "perpetual-app/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`${p.id}: HTTP ${res.status}`);
  const json: unknown = await res.json();
  const raw = p.parse(json);
  const panel = p.normalize(raw, now);
  assertPanel(panel);
  return panel;
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
  const health = await readHealth();
  return Promise.all(
    PROVIDERS.map(async (p): Promise<PanelResult> => {
      const quarantine = health.quarantined[p.id];
      if (!quarantine) {
        try {
          return { status: "live", panel: await fetchPanel(p, fetchImpl, now) };
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
