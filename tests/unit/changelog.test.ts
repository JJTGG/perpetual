import { describe, expect, it } from "vitest";
import { appendEntry, formatEntry, parseChangelog, ENTRY_MARKER } from "@/lib/changelog";

const summary = {
  at: "2026-10-17T15:00:00.000Z", generation: 7, slot: 100, theme: "Lagoon", layout: "grid",
  live: ["weather", "fx"], changes: ["Lagos sky: Temperature 29°C → 30°C"], healed: ["quarantined crypto (HTTP 429)"],
  tests: { passed: 40, failed: 0 },
};

describe("changelog", () => {
  it("appends without losing history", () => {
    const base = `# Changelog\n\n${ENTRY_MARKER}\n`;
    const once = appendEntry(base, formatEntry(summary));
    const twice = appendEntry(once, formatEntry({ ...summary, generation: 8 }));
    const entries = parseChangelog(twice);
    expect(entries).toHaveLength(2);
    expect(entries[0].heading).toContain("generation 7");
    expect(entries[1].heading).toContain("generation 8");
  });
  it("records heals and tests", () => {
    const [e] = parseChangelog(appendEntry("", formatEntry(summary)));
    expect(e.lines).toContain("Healed: quarantined crypto (HTTP 429)");
    expect(e.lines.at(-1)).toBe("Tests: 40 passed, 0 failed");
  });
});
