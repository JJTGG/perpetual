import type { Provider } from "../types";
import { weather } from "./weather";
import { quakes } from "./quakes";
import { crypto } from "./crypto";
import { fx } from "./fx";

// Order matters only as the base for rotation; add new endpoints here.
export const PROVIDERS: Provider<any>[] = [weather, quakes, crypto, fx];

export function getProvider(id: string): Provider<any> | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
