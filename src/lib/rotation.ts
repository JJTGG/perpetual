import { PROVIDERS } from "./providers";

export const ROTATION_HOURS = 3;
export const ROTATION_MS = ROTATION_HOURS * 3_600_000;
export const REFRESH_MS = 15 * 60_000;

export type Theme = {
  id: string;
  name: string;
  mode: "light" | "dark";
  bg: string; surface: string; text: string; muted: string; accent: string; line: string;
  display: string; // font stack key
};

export const THEMES: Theme[] = [
  { id: "harmattan", name: "Harmattan", mode: "light", bg: "#f3ede3", surface: "#fbf8f2", text: "#2b2118", muted: "#7a6a58", accent: "#b4532a", line: "#e2d7c6", display: "serif" },
  { id: "lagoon", name: "Lagoon", mode: "dark", bg: "#0d1517", surface: "#132023", text: "#e3eeec", muted: "#86a3a0", accent: "#4fd1b5", line: "#1f3337", display: "sans" },
  { id: "indigo-adire", name: "Adire", mode: "dark", bg: "#10142a", surface: "#171c38", text: "#e6e8f5", muted: "#9298c0", accent: "#8ea2ff", line: "#262d55", display: "serif" },
  { id: "chalk", name: "Chalk", mode: "light", bg: "#f6f6f4", surface: "#ffffff", text: "#151515", muted: "#6b6b6b", accent: "#1d4ed8", line: "#e4e4e0", display: "mono" },
  { id: "palm-oil", name: "Palm Oil", mode: "dark", bg: "#1a1208", surface: "#24190c", text: "#f4e7d2", muted: "#b89d79", accent: "#f2a33a", line: "#3a2a15", display: "sans" },
  { id: "rainy-season", name: "Rainy Season", mode: "light", bg: "#e8eeec", surface: "#f5f8f7", text: "#16241f", muted: "#5f726b", accent: "#2f7a5b", line: "#d3ddd9", display: "mono" },
];

export const LAYOUTS = ["grid", "spotlight", "ledger"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const CHART_STYLES = ["bars", "line"] as const;
export type ChartStyle = (typeof CHART_STYLES)[number];

export type Rotation = {
  slot: number;
  theme: Theme;
  layout: Layout;
  chart: ChartStyle;
  featured: string;
  order: string[];
  startedAt: string;
  nextAt: string;
};

/** Pure + deterministic: the same instant always yields the same rotation. */
export function getRotation(now: Date, quarantined: string[] = []): Rotation {
  const t = now.getTime();
  if (!Number.isFinite(t)) throw new Error("getRotation: invalid date");
  const slot = Math.floor(t / ROTATION_MS);
  const ids = PROVIDERS.map((p) => p.id);
  const healthy = ids.filter((id) => !quarantined.includes(id));
  const pool = healthy.length > 0 ? healthy : ids;
  const featured = pool[mod(slot, pool.length)];
  const shift = mod(slot, ids.length);
  const order = [...ids.slice(shift), ...ids.slice(0, shift)];
  return {
    slot,
    theme: THEMES[mod(slot, THEMES.length)],
    layout: LAYOUTS[mod(Math.floor(slot / 2), LAYOUTS.length)],
    chart: CHART_STYLES[mod(slot, CHART_STYLES.length)],
    featured,
    order: [featured, ...order.filter((id) => id !== featured)],
    startedAt: new Date(slot * ROTATION_MS).toISOString(),
    nextAt: new Date((slot + 1) * ROTATION_MS).toISOString(),
  };
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
