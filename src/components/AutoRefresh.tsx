"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const REFRESH_MS = 15 * 60_000;

function msToBoundary(now: number) {
  return REFRESH_MS - (now % REFRESH_MS);
}
function fmt(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(r).padStart(2, "0")}`;
}

export function AutoRefresh({ rotationEndsAt }: { rotationEndsAt: string }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    // Fire just after each 15-minute boundary so ISR has a fresh render ready.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => { router.refresh(); schedule(); }, msToBoundary(Date.now()) + 5_000);
    };
    schedule();
    return () => { clearInterval(tick); clearTimeout(timer); };
  }, [router]);
  const endsAt = Date.parse(rotationEndsAt);
  return (
    <div className="clocks" aria-live="off">
      <span><span className="muted">Next data refresh</span> <b className="num">{now ? fmt(msToBoundary(now)) : "--:--"}</b></span>
      <span><span className="muted">Next rotation</span> <b className="num">{now ? fmt(endsAt - now) : "--"}</b></span>
    </div>
  );
}
