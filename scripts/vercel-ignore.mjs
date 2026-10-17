// Vercel "Ignored Build Step": exit 0 = skip build, exit 1 = build.
// Data-only pulses are skipped (the live site already re-fetches via ISR every
// 15 min). Builds happen for code changes, rotations, heals ("[deploy]") and
// anything that is not a pure data/changelog commit.
import { execSync } from "node:child_process";

const sh = (c) => execSync(c, { encoding: "utf8" }).trim();
try {
  const msg = sh("git log -1 --pretty=%B");
  if (msg.includes("[deploy]")) { console.log("build: [deploy] marker"); process.exit(1); }
  const files = sh("git diff --name-only HEAD~1 HEAD").split("\n").filter(Boolean);
  const dataOnly = files.length > 0 && files.every((f) => f === "changelog.md" || f.startsWith("data/") || f.startsWith("config/"));
  if (dataOnly) { console.log("skip: data-only pulse"); process.exit(0); }
  console.log("build: code changed"); process.exit(1);
} catch (e) {
  console.log("build: could not inspect history", e?.message); process.exit(1);
}
