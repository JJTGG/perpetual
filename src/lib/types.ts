export type Metric = { label: string; value: string; hint?: string; trend?: "up" | "down" | "flat" };
export type Item = { title: string; meta: string; href?: string; weight?: number };

export type Panel = {
  id: string;
  title: string;
  source: string;
  fetchedAt: string; // ISO
  metrics: Metric[];
  series?: number[];
  seriesLabel?: string;
  items?: Item[];
};

export type PanelResult =
  | { status: "live"; panel: Panel }
  | { status: "stale"; panel: Panel; reason: string }
  | { status: "down"; id: string; title: string; reason: string };

export interface Provider<Raw = unknown> {
  id: string;
  title: string;
  url: string;
  /** zod schema of the raw response; introspected by the repair engine */
  schema: import("zod").ZodType<Raw>;
  /** zod-style parser: throws on contract violations */
  parse: (input: unknown) => Raw;
  normalize: (raw: Raw, fetchedAt: Date) => Panel;
}
