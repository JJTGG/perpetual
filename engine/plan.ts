import type { Strategy } from "./types";
import type { RepairMode } from "./config";
import { adaptersStrategy } from "./strategies/adapters";
import { snapshotStrategy } from "./strategies/snapshots";
import { quarantineStrategy } from "./strategies/quarantine";
import { templatesStrategy } from "./strategies/templates";
import { bisectStrategy } from "./strategies/bisect";
import { restoreStrategy } from "./strategies/restore";
import { llmStrategy } from "./strategies/llm";

/**
 * Strategy order per mode. Cheapest, narrowest, most explainable fixes first;
 * the wholesale restore always comes last.
 *   deterministic: rules only
 *   hybrid:        rules first, LLM only if rules can't finish the job
 *   llm:           LLM first for code/drift, rules as fallback
 */
export function plan(mode: RepairMode, opts: { llm: boolean; restore: boolean; llmStrategy?: Strategy }): Strategy[] {
  const llm = opts.llm ? [opts.llmStrategy ?? llmStrategy()] : [];
  const rules = [adaptersStrategy, snapshotStrategy, quarantineStrategy({ outageOnly: false }), templatesStrategy, bisectStrategy];
  const order =
    mode === "llm"
      ? [snapshotStrategy, quarantineStrategy({ outageOnly: true }), ...llm, ...rules]
      : mode === "hybrid"
        ? [...rules, ...llm]
        : rules;
  const seen = new Set<string>();
  const unique = order.filter((s) => !seen.has(s.id) && seen.add(s.id));
  return opts.restore ? [...unique, restoreStrategy] : unique;
}
