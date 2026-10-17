import { z } from "zod";
import type { Provider } from "../types";
import { fmtNumber, fmtPct, trendOf } from "../format";

const Coin = z.object({ usd: z.number(), usd_24h_change: z.number() });
const Schema = z.object({ bitcoin: Coin, ethereum: Coin, solana: Coin });
type Raw = z.infer<typeof Schema>;

const NAMES: Record<keyof Raw, string> = { bitcoin: "Bitcoin", ethereum: "Ether", solana: "Solana" };

export const crypto: Provider<Raw> = {
  id: "crypto",
  title: "Crypto tape",
  url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true",
  parse: (input) => Schema.parse(input),
  normalize: (raw, fetchedAt) => ({
    id: "crypto",
    title: "Crypto tape",
    source: "CoinGecko",
    fetchedAt: fetchedAt.toISOString(),
    metrics: (Object.keys(NAMES) as (keyof Raw)[]).map((k) => ({
      label: NAMES[k],
      value: `$${fmtNumber(raw[k].usd, raw[k].usd > 1000 ? 0 : 2)}`,
      hint: `${fmtPct(raw[k].usd_24h_change)} 24h`,
      trend: trendOf(raw[k].usd_24h_change),
    })),
    series: (Object.keys(NAMES) as (keyof Raw)[]).map((k) => raw[k].usd_24h_change),
    seriesLabel: "24h change (%) — BTC, ETH, SOL",
  }),
};
