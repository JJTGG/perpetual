/** Minimal clients for Anthropic, OpenAI and any OpenAI-compatible server (Ollama, vLLM, LM Studio, OpenRouter...). */
import type { RepairConfig } from "../config";
import { apiKeyEnvName, type Env } from "../config";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;
export type Completion = { text: string; model: string };

export function buildRequest(cfg: RepairConfig, system: string, user: string, env: Env = process.env): { url: string; init: RequestInit } {
  const key = env[apiKeyEnvName(cfg)];
  const { provider, model, temperature, baseUrl } = cfg.llm;
  if (provider === "anthropic") {
    return {
      url: `${baseUrl ?? "https://api.anthropic.com"}/v1/messages`,
      init: {
        method: "POST",
        headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": key ?? "" },
        body: JSON.stringify({ model, max_tokens: 8000, temperature, system, messages: [{ role: "user", content: user }] }),
      },
    };
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  return {
    url: `${(baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`,
    init: {
      method: "POST",
      headers,
      // seed + temperature 0 make OpenAI-style backends as repeatable as they allow
      body: JSON.stringify({ model, temperature, seed: 7, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    },
  };
}

export async function complete(cfg: RepairConfig, system: string, user: string, fetchImpl: Fetch = fetch, env: Env = process.env): Promise<Completion> {
  const { url, init } = buildRequest(cfg, system, user, env);
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${cfg.llm.provider} API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as any;
  const text = cfg.llm.provider === "anthropic"
    ? (body.content ?? []).map((c: { text?: string }) => c.text ?? "").join("")
    : body.choices?.[0]?.message?.content ?? "";
  return { text, model: body.model ?? cfg.llm.model };
}

export function extractDiff(text: string): string | null {
  const fenced = text.match(/```(?:diff|patch)?\s*\n([\s\S]*?)```/);
  const diff = (fenced?.[1] ?? (text.includes("--- a/") ? text : "")).trim();
  return diff ? diff + "\n" : null;
}
