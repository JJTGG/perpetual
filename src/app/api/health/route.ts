import { readHealth, readState } from "@/lib/fsdata";

export const dynamic = "force-dynamic";

export async function GET() {
  const [health, state] = await Promise.all([readHealth(), readState()]);
  return Response.json({ ok: true, ...state, quarantined: health.quarantined });
}
