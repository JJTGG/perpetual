import { z } from "zod";
import type { Provider } from "../types";
import { describeWeatherCode, fmtNumber } from "../format";

const Schema = z.object({
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    relative_humidity_2m: z.number(),
    wind_speed_10m: z.number(),
    weather_code: z.number(),
  }),
  hourly: z.object({ time: z.array(z.string()), temperature_2m: z.array(z.number().nullable()) }),
});
type Raw = z.infer<typeof Schema>;

export const weather: Provider<Raw> = {
  id: "weather",
  title: "Lagos sky",
  url: "https://api.open-meteo.com/v1/forecast?latitude=6.45&longitude=3.39&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&hourly=temperature_2m&forecast_days=1&timezone=Africa%2FLagos",
  schema: Schema,
  parse: (input) => Schema.parse(input),
  normalize: (raw, fetchedAt) => ({
    id: "weather",
    title: "Lagos sky",
    source: "Open-Meteo",
    fetchedAt: fetchedAt.toISOString(),
    metrics: [
      { label: "Temperature", value: `${fmtNumber(raw.current.temperature_2m, 1)}°C`, hint: describeWeatherCode(raw.current.weather_code) },
      { label: "Humidity", value: `${fmtNumber(raw.current.relative_humidity_2m, 0)}%` },
      { label: "Wind", value: `${fmtNumber(raw.current.wind_speed_10m, 1)} km/h` },
    ],
    series: raw.hourly.temperature_2m.filter((t): t is number => typeof t === "number"),
    seriesLabel: "Hourly temperature today (°C)",
  }),
};
