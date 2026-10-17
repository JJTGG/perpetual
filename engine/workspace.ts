import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

export function git(cwd: string, args: string[], input?: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
}

export function tryGit(cwd: string, args: string[], input?: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: git(cwd, args, input) };
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message: string };
    return { ok: false, out: String(err.stderr ?? err.message) };
  }
}

export const MUTABLE_ROOTS = ["src", "tests", "config", "data", "package.json", "package-lock.json"];

/** In-memory snapshot of every mutable file so any candidate can be rolled back exactly. */
export class Checkpoint {
  private files = new Map<string, Buffer>();
  constructor(private cwd: string) {
    for (const f of this.list()) this.files.set(f, readFileSync(path.join(cwd, f)));
  }
  private list(): string[] {
    const out = tryGit(this.cwd, ["ls-files", "-co", "--exclude-standard", "--", ...MUTABLE_ROOTS]);
    return out.ok ? out.out.split("\n").filter((f) => f && existsSync(path.join(this.cwd, f))) : [];
  }
  restore(): void {
    for (const f of this.list()) if (!this.files.has(f)) rmSync(path.join(this.cwd, f), { force: true });
    for (const [f, buf] of this.files) {
      mkdirSync(path.dirname(path.join(this.cwd, f)), { recursive: true });
      writeFileSync(path.join(this.cwd, f), buf);
    }
  }
}

export function readJsonAt<T>(cwd: string, rel: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path.join(cwd, rel), "utf8")) as T;
  } catch {
    return fallback;
  }
}
export function writeJsonAt(cwd: string, rel: string, data: unknown): void {
  mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  writeFileSync(path.join(cwd, rel), JSON.stringify(data, null, 2) + "\n");
}
