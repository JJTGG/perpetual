import type { PanelResult } from "@/lib/types";
import type { ChartStyle } from "@/lib/rotation";
import { relativeTime } from "@/lib/format";
import { Chart } from "./Chart";

export function PanelCard({ result, chart, featured, now }: { result: PanelResult; chart: ChartStyle; featured?: boolean; now: Date }) {
  if (result.status === "down") {
    return (
      <article className={`panel down ${featured ? "featured" : ""}`} data-panel={result.id}>
        <header className="panel-head">
          <h2>{result.title}</h2>
          <span className="badge badge-down">Offline</span>
        </header>
        <p className="muted small">No live data and no saved snapshot yet. The next pulse will retry.</p>
      </article>
    );
  }
  const { panel } = result;
  return (
    <article className={`panel ${featured ? "featured" : ""}`} data-panel={panel.id} data-status={result.status}>
      <header className="panel-head">
        <h2>{panel.title}</h2>
        <span className={`badge ${result.status === "live" ? "badge-live" : "badge-stale"}`} title={result.status === "stale" ? result.reason : undefined}>
          {result.status === "live" ? "Live" : "Snapshot"}
        </span>
      </header>
      <dl className="metrics">
        {panel.metrics.map((m) => (
          <div key={m.label} className="metric">
            <dt>{m.label}</dt>
            <dd className="num">{m.value}</dd>
            {m.hint ? <dd className={`hint ${m.trend ?? ""}`}>{m.hint}</dd> : null}
          </div>
        ))}
      </dl>
      {panel.series && panel.series.length > 0 ? <Chart data={panel.series} style={chart} label={panel.seriesLabel} /> : panel.seriesLabel ? <p className="muted small">{panel.seriesLabel}</p> : null}
      {panel.items && panel.items.length > 0 ? (
        <ul className="items">
          {panel.items.slice(0, featured ? 6 : 4).map((it) => (
            <li key={it.title + it.meta}>
              {it.href ? <a href={it.href} target="_blank" rel="noreferrer">{it.title}</a> : <span>{it.title}</span>}
              <span className="num muted">{it.meta}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <footer className="panel-foot muted small">
        {panel.source} · {relativeTime(new Date(panel.fetchedAt), now)}
      </footer>
    </article>
  );
}
