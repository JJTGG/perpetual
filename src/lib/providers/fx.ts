import { z } from "zod";
import type { Provider } from "../types";
import { fmtNumber } from "../format";

const Schema = z.object({
  result: z.literal("success"),
  base_code: z.literal("USD"),
  time_last_update_utc: z.string(),
  rates: z.record(z.string(), z.number()).refine((r) => ["NGN", "EUR", "GBP", "GHS", "KES", "ZAR"].every((c) => typeof r[c] === "number"), {
    message: "missing required currencies",
  }),
});
type Raw = z.infer<typeof Schema>;

const WATCH = ["NGN", "GHS", "KES", "ZAR", "EUR", "GBP"] as const;

export const fx: Provider<Raw> = {
  id: "fx",
  title: "Dollar board",
  url: "https://open.er-api.com/v6/latest/USD",
  schema: Schema,
  parse: (input) => Schema.parse(input),
  normalize: (raw, fetchedAt) => ({
    id: "fx",
    title: "Dollar board",
    source: "ExchangeRate-API",
    fetchedAt: fetchedAt.toISOString(),
    metrics: WATCH.slice(0, 3).map((c) => ({ label: `USD → ${c}`, value: fmtNumber(raw.rates[c], 2) })),
    items: WATCH.map((c) => ({ title: `1 USD in ${c}`, meta: fmtNumber(raw.rates[c], 4) })),
    seriesLabel: `Rates published ${raw.time_last_update_utc}`,
  }),
};
