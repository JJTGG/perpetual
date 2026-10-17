# Perpetual

A Next.js + TypeScript dashboard that is never finished. It pulls live public data, tests itself on every update, repairs itself when something breaks, and keeps changing how it looks.

## What runs, and when

| Cadence | What happens | Where |
| --- | --- | --- |
| Every 15 min (live site) | Pages re-render with fresh API data (ISR `revalidate = 900`); open browsers call `router.refresh()` on each 15-minute boundary | `src/app/page.tsx`, `src/components/AutoRefresh.tsx` |
| Every 15 min (pipeline) | Pulse: fetch → unit + integration + live-contract tests → self-heal → build gate → append `changelog.md` → commit | `.github/workflows/pulse.yml`, `scripts/pulse.sh` |
| Every 3 h | Theme, layout, chart style, panel order and spotlight endpoint (`/api/feed/<id>`) rotate; the pulse marks that commit `[deploy]` | `src/lib/rotation.ts` |
| Every push / PR | Typecheck, unit, integration, build. A broken commit on `main` is auto-patched (optional AI) or auto-reverted | `.github/workflows/ci.yml` |
| Every Vercel build | `npm run vercel-build` runs the full test suite before `next build`; a failing build never replaces the live deployment | `vercel.json` |

## Data sources (no API keys)

- Open-Meteo: Lagos weather
- USGS: M2.5+ earthquakes, past day
- CoinGecko: BTC / ETH / SOL
- ExchangeRate-API: USD → NGN, GHS, KES, ZAR, EUR, GBP

Every response is validated with a zod contract and a panel invariant check (`assertPanel`) before it can reach the UI or be committed.

## Self-healing tiers

1. Data: a feed that fails its fetch or contract is quarantined in `config/health.json`. The UI falls back to the last-good snapshot in `data/snapshots/`. It is released automatically once it passes again. Corrupted snapshots are restored from git.
2. AI patch (optional): if the repo secret `ANTHROPIC_API_KEY` is set, failing test output plus the source is sent to Claude, the returned diff is applied, and it is kept only if the full suite and build pass.
3. Code restore: otherwise `src/`, `tests/` and dependencies are restored from `data/state.json → lastGreenSha`, the last commit that passed a full pulse. On a human push, the breaking commit is reverted.
4. If every tier fails, nothing is committed or deployed. Production keeps serving the last green build, and a `pulse-failure` issue is opened (closed automatically on recovery).

## Deploy volume

Data-only pulses are skipped by Vercel's ignored-build step (`scripts/vercel-ignore.mjs`) because the live site already refreshes itself via ISR. Builds happen on rotations (about 8 per day), heals, and code changes. That keeps well under Vercel Hobby's daily deployment limit.

## Local commands

```bash
npm ci
npm run dev                # local app
npm run verify             # typecheck + all offline tests
LIVE=1 npm test            # include live API contract tests
bash scripts/pulse.sh      # one full pulse locally (no commit)
PREVIEW_AT=2026-10-18T03:01:00Z npm run dev   # preview a future rotation
```

## Adding a feed

Create `src/lib/providers/<id>.ts` (url, zod schema, normalize), register it in `src/lib/providers/index.ts`, and add `tests/fixtures/<id>.json`. The rotation, routes, tests and healer pick it up automatically.

## Known limits

- GitHub's cron is best-effort; runs can be delayed by several minutes under load.
- GitHub disables scheduled workflows after 60 days without repository activity. The pulse commits count as activity, so this only matters if the pulse fails for 60 straight days.
- "Zero bugs" means zero bugs that the test suite can detect. The gates keep a failing build from shipping; they cannot prove the absence of untested defects.
- `changelog.md` grows by about 96 entries a day.
