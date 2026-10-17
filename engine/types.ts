import type { ContractIssue, PulseReport, TestReport } from "../scripts/lib";
import type { RepairConfig } from "./config";
import type { Trace } from "./narrate";

export type Diagnosis =
  | { kind: "outage"; provider: string; detail: string }
  | { kind: "contract-drift"; provider: string; issues: ContractIssue[]; rawFile?: string; detail: string }
  | { kind: "corrupt-snapshot"; provider: string; file: string; detail: string }
  | { kind: "runtime-error"; test: string; message: string; property?: string; file?: string; line?: number }
  | { kind: "assertion"; test: string; message: string; file?: string; line?: number }
  | { kind: "type-error"; file: string; line: number; message: string };

export type Verdict = {
  green: boolean;
  /** stable ids of everything that failed: "<file>::<test>" or "tsc::<file>:<line>" */
  failing: string[];
  report: TestReport | null;
  tsc: string;
};

export type Oracle = () => Promise<Verdict>;

export type Candidate = {
  strategy: string;
  /** one-line, human-readable description of the change */
  summary: string;
  /** why the engine believes this fixes the problem */
  rationale: string;
  apply: () => Promise<void>;
  /** set by the strategy when the fix replaces code wholesale */
  restoresCode?: boolean;
};

export type Ctx = {
  cwd: string;
  config: RepairConfig;
  oracle: Oracle;
  trace: Trace;
  pulse: PulseReport | null;
  /** git ref the code is compared against (last green pulse, or the parent commit in CI) */
  base: string | null;
  /** failure output of the most recent rejected candidate (fed back to LLM attempts) */
  lastRejection?: string;
  probes: { used: number };
};

export interface Strategy {
  id: string;
  kind: "deterministic" | "llm";
  applies: (d: Diagnosis[]) => boolean;
  propose: (d: Diagnosis[], ctx: Ctx) => Promise<Candidate[]>;
}
