export type Env = Record<string, string | undefined>;
import { readJsonAt } from "./workspace";

export type RepairMode = "deterministic" | "hybrid" | "llm";
export type LlmProvider = "anthropic" | "openai" | "openai-compatible";

export type RepairConfig = {
  mode: RepairMode;
  maxRounds: number;
  maxProbes: number;
  llm: {
    provider: LlmProvider;
    model: string;
    baseUrl: string | null;
    apiKeyEnv: string | null;
    temperature: number;
    maxAttempts: number;
    maxChangedLines: number;
    allowedPaths: string[];
  };
};

export const DEFAULT_CONFIG: RepairConfig = {
  mode: "deterministic",
  maxRounds: 6,
  maxProbes: 24,
  llm: {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    baseUrl: null,
    apiKeyEnv: null,
    temperature: 0,
    maxAttempts: 2,
    maxChangedLines: 80,
    allowedPaths: ["src/", "config/adapters.json"],
  },
};

const MODES: RepairMode[] = ["deterministic", "hybrid", "llm"];
const PROVIDERS: LlmProvider[] = ["anthropic", "openai", "openai-compatible"];

/** config/repair.json, then env overrides (REPAIR_MODE, LLM_PROVIDER, LLM_MODEL, LLM_BASE_URL). Invalid values fall back to defaults. */
export function loadConfig(cwd: string, env: Env = process.env): RepairConfig {
  const file = readJsonAt<Partial<RepairConfig>>(cwd, "config/repair.json", {});
  const cfg: RepairConfig = { ...DEFAULT_CONFIG, ...file, llm: { ...DEFAULT_CONFIG.llm, ...(file.llm ?? {}) } };
  if (env.REPAIR_MODE) cfg.mode = env.REPAIR_MODE as RepairMode;
  if (env.LLM_PROVIDER) cfg.llm.provider = env.LLM_PROVIDER as LlmProvider;
  if (env.LLM_MODEL) cfg.llm.model = env.LLM_MODEL;
  if (env.LLM_BASE_URL) cfg.llm.baseUrl = env.LLM_BASE_URL;
  if (!MODES.includes(cfg.mode)) cfg.mode = "deterministic";
  if (!PROVIDERS.includes(cfg.llm.provider)) cfg.llm.provider = "anthropic";
  return cfg;
}

export function apiKeyEnvName(cfg: RepairConfig): string {
  if (cfg.llm.apiKeyEnv) return cfg.llm.apiKeyEnv;
  return cfg.llm.provider === "anthropic" ? "ANTHROPIC_API_KEY" : cfg.llm.provider === "openai" ? "OPENAI_API_KEY" : "LLM_API_KEY";
}

/** LLM strategies are usable only when the mode asks for them and credentials exist (local OpenAI-compatible servers may need none). */
export function llmAvailable(cfg: RepairConfig, env: Env = process.env): boolean {
  if (cfg.mode === "deterministic") return false;
  if (cfg.llm.provider === "openai-compatible") return Boolean(cfg.llm.baseUrl);
  return Boolean(env[apiKeyEnvName(cfg)]);
}
