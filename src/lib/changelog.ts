export type ChangelogEntry = { heading: string; lines: string[] };

export const ENTRY_MARKER = "<!-- entries -->";

export function parseChangelog(md: string): ChangelogEntry[] {
  const body = md.includes(ENTRY_MARKER) ? md.split(ENTRY_MARKER)[1] : md;
  const out: ChangelogEntry[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) out.push({ heading: line.slice(3), lines: [] });
    else if (line.startsWith("- ") && out.length) out[out.length - 1].lines.push(line.slice(2));
  }
  return out;
}

export type PulseSummary = {
  at: string;
  generation: number;
  slot: number;
  theme: string;
  layout: string;
  live: string[];
  changes: string[];
  healed: string[];
  tests: { passed: number; failed: number };
};

export function formatEntry(s: PulseSummary): string {
  const lines = [
    `## ${s.at} · generation ${s.generation}`,
    `- Rotation #${s.slot}: theme ${s.theme}, layout ${s.layout}`,
    `- Feeds live: ${s.live.length ? s.live.join(", ") : "none"}`,
    ...s.changes.map((c) => `- ${c}`),
    ...s.healed.map((h) => `- Healed: ${h}`),
    `- Tests: ${s.tests.passed} passed, ${s.tests.failed} failed`,
  ];
  return lines.join("\n") + "\n";
}

export function appendEntry(md: string, entry: string): string {
  const base = md.trim().length ? md.replace(/\s*$/, "\n") : `# Changelog\n\n${ENTRY_MARKER}\n`;
  return `${base}\n${entry}`;
}
