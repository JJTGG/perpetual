/**
 * The engine "thinks out loud" like an assistant would, but every sentence is
 * produced from structured facts by fixed templates, so the same incident always
 * yields the same explanation.
 */
import type { Diagnosis } from "./types";

export type Step = "observe" | "diagnose" | "hypothesize" | "act" | "verify" | "reject" | "conclude";
export type TraceEntry = { step: Step; text: string };

export class Trace {
  entries: TraceEntry[] = [];
  add(step: Step, text: string) {
    this.entries.push({ step, text });
  }
  toMarkdown(title = "Repair trace"): string {
    const label: Record<Step, string> = {
      observe: "Observed", diagnose: "Diagnosis", hypothesize: "Hypothesis", act: "Action", verify: "Verified", reject: "Rejected", conclude: "Conclusion",
    };
    return `# ${title}\n\n` + this.entries.map((e, i) => `${i + 1}. **${label[e.step]}:** ${e.text}`).join("\n") + "\n";
  }
}

export function describe(d: Diagnosis): string {
  switch (d.kind) {
    case "outage":
      return `the ${d.provider} feed is unreachable (${d.detail}); this is an upstream problem, not a code defect`;
    case "contract-drift":
      return `the ${d.provider} API changed shape: ${d.issues.slice(0, 3).map((i) => `\`${i.path.join(".")}\` ${i.message.replace(/^Invalid input: /, "")}`).join("; ")}`;
    case "corrupt-snapshot":
      return `the saved snapshot ${d.file} violates panel invariants (${d.detail})`;
    case "runtime-error":
      return `"${d.test}" crashes with "${d.message.split("\n")[0]}"${d.file ? ` at ${d.file}:${d.line}` : ""}`;
    case "assertion":
      return `"${d.test}" fails its assertion: ${d.message.split("\n")[0].slice(0, 200)}${d.file ? ` (${d.file}:${d.line})` : ""}`;
    case "type-error":
      return `the type checker rejects ${d.file}:${d.line}: ${d.message}`;
  }
}
