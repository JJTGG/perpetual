import { getProvider, PROVIDERS } from "@/lib/providers";
import { fetchPanel } from "@/lib/pipeline";
import { readSnapshot } from "@/lib/fsdata";

export const revalidate = 900;

export async function GET(_req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const p = getProvider(provider);
  if (!p) return Response.json({ error: "unknown provider", available: PROVIDERS.map((x) => x.id) }, { status: 404 });
  try {
    return Response.json({ status: "live", panel: await fetchPanel(p) });
  } catch (err) {
    const snap = await readSnapshot(p.id);
    if (snap) return Response.json({ status: "stale", panel: snap, reason: String(err) });
    return Response.json({ status: "down", reason: String(err) }, { status: 503 });
  }
}

export function generateStaticParams() {
  return PROVIDERS.map((p) => ({ provider: p.id }));
}
