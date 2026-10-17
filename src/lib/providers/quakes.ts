import { z } from "zod";
import type { Provider } from "../types";
import { fmtNumber } from "../format";

const Feature = z.object({
  id: z.string(),
  properties: z.object({
    mag: z.number().nullable(),
    place: z.string().nullable(),
    time: z.number(),
    url: z.string(),
  }),
});
const Schema = z.object({
  type: z.literal("FeatureCollection"),
  metadata: z.object({ count: z.number(), generated: z.number() }),
  features: z.array(Feature),
});
type Raw = z.infer<typeof Schema>;

export const quakes: Provider<Raw> = {
  id: "quakes",
  title: "Earth tremors",
  url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
  parse: (input) => Schema.parse(input),
  normalize: (raw, fetchedAt) => {
    const valid = raw.features.filter((f) => typeof f.properties.mag === "number");
    const sorted = [...valid].sort((a, b) => (b.properties.mag ?? 0) - (a.properties.mag ?? 0));
    const strongest = sorted[0];
    const byHour = new Array(24).fill(0) as number[];
    for (const f of valid) {
      const hoursAgo = Math.floor((fetchedAt.getTime() - f.properties.time) / 3_600_000);
      if (hoursAgo >= 0 && hoursAgo < 24) byHour[23 - hoursAgo] += 1;
    }
    return {
      id: "quakes",
      title: "Earth tremors",
      source: "USGS",
      fetchedAt: fetchedAt.toISOString(),
      metrics: [
        { label: "M2.5+ in 24h", value: fmtNumber(raw.metadata.count, 0) },
        { label: "Strongest", value: strongest ? `M${fmtNumber(strongest.properties.mag ?? 0, 1)}` : "None", hint: strongest?.properties.place ?? undefined },
      ],
      series: byHour,
      seriesLabel: "Events per hour, last 24h",
      items: sorted.slice(0, 6).map((f) => ({
        title: f.properties.place ?? "Unknown location",
        meta: `M${fmtNumber(f.properties.mag ?? 0, 1)}`,
        href: f.properties.url,
        weight: f.properties.mag ?? 0,
      })),
    };
  },
};
