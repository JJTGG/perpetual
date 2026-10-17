import { getRotation } from "@/lib/rotation";
import { readHealth } from "@/lib/fsdata";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await readHealth();
  return Response.json(getRotation(new Date(), Object.keys(health.quarantined)));
}
