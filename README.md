# Perpetual

A Next.js + TypeScript dashboard that is never finished. It pulls live public data, tests itself on every update, repairs itself when something breaks, and keeps changing how it looks.

## What runs, and when

| Cadence | What happens | Where |
| --- | --- | --- |
| Every 15 min (live site) | Pages re-render with fresh API data (ISR `revalidate = 900`); open browsers call `router.refresh()` on each 15-minute boundary | `src/app/page.tsx`, `src/components/AutoRefresh.tsx` |
| Every 15 min (pipeline) | Pulse: fetch → unit + integration + live-contract tests → self-heal → build gate → append `changelog.md` → commit | `.github/workflows/pulse.yml`, `scripts/pulse.sh` |
| Every 3 h | Theme, layout, chart style, panel order and spotlight endpoint (`/api/feed/<id>`) rotate; the pulse marks that commit `[deploy]` | `src/lib/rotation.ts` |
| Every push / PR | Typecheck, unit, engine, integration, build. A broken commit on `main` goes to the repair engine; if it can't reach green, the commit is reverted | `.github/workflows/ci.yml` |
| Every Vercel build | `npm run vercel-build` runs the full test suite before `next build`; a failing build never replaces the live deployment | `vercel.json` |

## Data sources (no API keys)

- Open-Meteo: Lagos weather
- USGS: M2.5+ earthquakes, past day
- CoinGecko: BTC / ETH / SOL
- ExchangeRate-API: USD → NGN, GHS, KES, ZAR, EUR, GBP

Every response is validated with a zod contract and a panel invariant check (`assertPanel`) before it can reach the UI or be committed.

## Repair engine

`engine/` is a rule-based repair engine that works the way an assistant debugging the system would: it observes, diagnoses, forms a hypothesis, makes a change, checks it, and explains itself. Every step is a fixed algorithm, so the same failure always produces the same fix and the same explanation.

The judge never changes. A candidate fix is kept only if typecheck plus the full test suite show strictly fewer failures and no new ones. Otherwise it is rolled back byte-for-byte.

| Strategy | Triggered by | What it does |
| --- | --- | --- |
| `drift-adapter` | An API changed shape (zod contract failure) | Compares the failing payload with the schema, finds renamed fields by name similarity and type, and spots numbers sent as strings. Writes the fix to `config/adapters.json` as data, with no code edits, after checking it against the exact payload that failed |
| `snapshot-restore` | A saved snapshot breaks panel rules | Restores it from git, or removes it |
| `quarantine` | Upstream outage (HTTP 429/5xx, network) or drift it can't resolve | Serves the last-good snapshot. Housekeeping releases the feed on the first healthy pulse |
| `fix-template` | A crash with a known signature at a known line | Applies a small, well-known rewrite (for example, optional chaining for `Cannot read properties of undefined (reading 'x')`) |
| `hunk-bisect` | Any code failure | Delta debugging (ddmin) over the diff since the last green commit. Reverts the smallest set of changed blocks that turns the suite green and keeps every other change |
| `llm-patch` | Optional, see below | Asks a model for a minimal diff, which must pass the same guardrails and judge |
| `restore-last-green` | Last resort | Restores `src/`, `tests/` and dependencies from the last green commit |

Each repair writes a numbered trace (Observed → Diagnosis → Hypothesis → Action → Verified / Rejected → Conclusion) to `.pulse/repair-trace.md`. The trace is uploaded as a workflow artifact and included in self-heal issues. Fix summaries go into `changelog.md`.

If nothing reaches green, nothing is committed or deployed. Production keeps the last green build and a `pulse-failure` issue is opened, then closed automatically on recovery.

### Modes

Set in `config/repair.json` or overridden with the repo variable `REPAIR_MODE`:

- `deterministic` (default): rules only. No network calls besides the data APIs.
- `hybrid`: rules first. The LLM is consulted only if rules can't reach green.
- `llm`: LLM first for code and drift problems, with rules as fallback. Outages and corrupt snapshots are still handled by rules first.

LLM tiers activate only when the mode asks for them and credentials exist. Otherwise the engine logs that and runs rules only.

| Provider (`LLM_PROVIDER` var or `llm.provider`) | Credential | Notes |
| --- | --- | --- |
| `anthropic` | secret `ANTHROPIC_API_KEY` | Messages API |
| `openai` | secret `OPENAI_API_KEY` | Chat Completions, `seed` fixed |
| `openai-compatible` | var `LLM_BASE_URL`, optional secret `LLM_API_KEY` | Ollama, vLLM, LM Studio, OpenRouter, a self-hosted runner, etc. |

LLM guardrails: temperature 0. Patches may only touch `llm.allowedPaths` (default `src/`, `config/adapters.json`). Tests, workflows, scripts, the engine, dependencies and `config/repair.json` are always off-limits, because tests are the judge. Patches are capped at `maxChangedLines` lines and `maxAttempts` attempts per round, and a rejected attempt's failure output is fed into the next one.

### CLI

```bash
npm run repair                                   # what the pulse runs on failure
npx tsx engine/run.ts repair --mode=hybrid       # try another mode locally
npx tsx engine/run.ts repair --base=HEAD~1 --no-live --no-restore   # what CI runs on a broken push
```

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
- The judge (tests + typecheck) defines "fixed". Rule-based strategies only fix failure patterns they recognise; anything else falls back to bisect or restore.
- "Zero bugs" means zero bugs that the test suite can detect. The gates keep a failing build from shipping; they cannot prove the absence of untested defects.
- `changelog.md` grows by about 96 entries a day.
