import { runTick } from "@/lib/tick";

// Called every 5 minutes by Supabase Cron (pg_cron + pg_net).
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runTick();
  return Response.json({ ok: true, results });
}
