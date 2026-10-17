export function fmtNumber(n: number, digits = 2): string {
  if (!Number.isFinite(n)) throw new Error(`fmtNumber: non-finite value ${n}`);
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`fmtPct: non-finite value ${n}`);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function trendOf(n: number, epsilon = 0.05): "up" | "down" | "flat" {
  if (n > epsilon) return "up";
  if (n < -epsilon) return "down";
  return "flat";
}

const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
  80: "Rain showers", 81: "Heavy showers", 82: "Violent showers",
  95: "Thunderstorm", 96: "Thunderstorm, hail", 99: "Severe thunderstorm",
};
export function describeWeatherCode(code: number): string {
  return WMO[code] ?? `Code ${code}`;
}

export function relativeTime(from: Date, to: Date): string {
  const s = Math.round((to.getTime() - from.getTime()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return `${abs}s ago`;
  if (abs < 3600) return `${Math.round(abs / 60)}m ago`;
  if (abs < 86400) return `${Math.round(abs / 3600)}h ago`;
  return `${Math.round(abs / 86400)}d ago`;
}
