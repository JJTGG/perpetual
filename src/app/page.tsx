import Link from "next/link";
import type { CSSProperties } from "react";
import { loadPanels } from "@/lib/pipeline";
import { getRotation, ROTATION_HOURS } from "@/lib/rotation";
import { readHealth, readState } from "@/lib/fsdata";
import { PanelCard } from "@/components/PanelCard";
import { AutoRefresh } from "@/components/AutoRefresh";

export const revalidate = 900; // ISR: re-render at most every 15 minutes

export default async function Home() {
  // PREVIEW_AT lets QA render a future rotation locally; it is never set in production.
  const now = process.env.PREVIEW_AT ? new Date(process.env.PREVIEW_AT) : new Date();
  const [health, state] = await Promise.all([readHealth(), readState()]);
  const rotation = getRotation(now, Object.keys(health.quarantined));
  const results = await loadPanels(fetch, now);
  const byId = new Map(results.map((r) => [r.status === "down" ? r.id : r.panel.id, r]));
  const ordered = rotation.order.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
  const t = rotation.theme;
  const style = {
    "--bg": t.bg, "--surface": t.surface, "--text": t.text, "--muted": t.muted, "--accent": t.accent, "--line": t.line,
    "--display": `var(--font-${t.display})`,
    colorScheme: t.mode,
  } as CSSProperties;
  const live = results.filter((r) => r.status === "live").length;

  return (
    <div className="shell" style={style} data-theme={t.id} data-layout={rotation.layout}>
      <header className="top">
        <div className="brand">
          <span className="wordmark">Perpetual</span>
          <span className="muted small">generation <b className="num">{state.generation}</b> · rotation <b className="num">#{rotation.slot}</b></span>
        </div>
        <AutoRefresh rotationEndsAt={rotation.nextAt} />
      </header>

      <section className="intro">
        <h1>
          {live}/{results.length} feeds live. Theme <em>{t.name}</em>, layout <em>{rotation.layout}</em>.
        </h1>
        <p className="muted">
          Data refreshes every 15 minutes. The look, layout, chart style and spotlight feed rotate every {ROTATION_HOURS} hours, so there is no final version.
        </p>
      </section>

      <main className={`board layout-${rotation.layout}`}>
        {ordered.map((r, i) => (
          <PanelCard key={r.status === "down" ? r.id : r.panel.id} result={r} chart={rotation.chart} featured={i === 0 && rotation.layout !== "grid"} now={now} />
        ))}
      </main>

      <footer className="bottom small">
        <div>
          <span className="muted">Last pulse</span> <span className="num">{state.lastRunAt ? new Date(state.lastRunAt).toUTCString() : "not yet"}</span>
          {Object.keys(health.quarantined).length > 0 ? (
            <span className="warn"> · Quarantined: {Object.keys(health.quarantined).join(", ")}</span>
          ) : null}
        </div>
        <nav>
          <Link href="/changelog">Changelog</Link>
          <a href="/api/rotation">/api/rotation</a>
          <a href="/api/health">/api/health</a>
          <a href={`/api/feed/${rotation.featured}`}>/api/feed/{rotation.featured}</a>
        </nav>
      </footer>
    </div>
  );
}
