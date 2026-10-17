import Link from "next/link";
import { readChangelog } from "@/lib/fsdata";
import { parseChangelog } from "@/lib/changelog";

export const revalidate = 900;

export default async function ChangelogPage() {
  const entries = parseChangelog(await readChangelog()).reverse().slice(0, 100);
  return (
    <div className="shell plain">
      <header className="top">
        <Link href="/" className="wordmark">Perpetual</Link>
        <span className="muted small">{entries.length === 0 ? "No pulses recorded yet" : `Latest ${entries.length} pulses, newest first`}</span>
      </header>
      <main className="log">
        {entries.map((e) => (
          <article key={e.heading} className="log-entry">
            <h2 className="num">{e.heading}</h2>
            <ul>{e.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </article>
        ))}
      </main>
    </div>
  );
}
