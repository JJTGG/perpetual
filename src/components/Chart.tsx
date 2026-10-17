import type { ChartStyle } from "@/lib/rotation";

export function Chart({ data, style, label }: { data: number[]; style: ChartStyle; label?: string }) {
  if (data.length === 0) return null;
  const w = 320, h = 72, pad = 4;
  // Counts and signed values anchor at zero; strictly positive series (e.g. temperature)
  // zoom to their own range so small swings stay visible.
  const lo = Math.min(...data), hi = Math.max(...data);
  const anchored = lo <= 0;
  const span = hi - lo || 1;
  const min = anchored ? Math.min(0, lo) : lo - span * 0.25;
  const max = anchored ? Math.max(hi, min + 1) : hi + span * 0.15;
  const y = (v: number) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const step = (w - pad * 2) / Math.max(1, data.length - (style === "line" ? 1 : 0));
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label ?? "chart"} preserveAspectRatio="none">
        {min <= 0 && max >= 0 ? <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} className="chart-zero" /> : null}
        {style === "bars"
          ? data.map((v, i) => {
              const top = Math.min(y(v), y(0));
              return <rect key={i} x={pad + i * step + step * 0.15} width={step * 0.7} y={top} height={Math.max(1, Math.abs(y(v) - y(0)))} rx={1.5} className={v < 0 ? "bar neg" : "bar"} />;
            })
          : (
            <polyline fill="none" className="chart-line" points={data.map((v, i) => `${pad + i * step},${y(v)}`).join(" ")} />
          )}
      </svg>
      {label ? <figcaption>{label}</figcaption> : null}
    </figure>
  );
}
