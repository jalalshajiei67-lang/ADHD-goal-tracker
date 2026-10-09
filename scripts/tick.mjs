// Triggers the scheduler tick, the same call Supabase Cron makes every 5 minutes in production.
// Run once:          node scripts/tick.mjs [base-url]          (default http://localhost:3000)
// Keep ticking:      node scripts/tick.mjs --watch [base-url]  (every 60 s, for local testing)
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const base = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";

async function tick() {
  try {
    const res = await fetch(`${base}/api/cron/tick`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const body = await res.json();
    const sent = Object.values(body.results ?? {}).flat();
    const time = new Date().toLocaleTimeString();
    console.log(`${time}  ${res.status}  ${sent.length ? `sent: ${sent.join(", ")}` : "nothing due"}`);
  } catch (err) {
    console.log(`${new Date().toLocaleTimeString()}  failed: ${err.message}`);
  }
}

await tick();
if (watch) setInterval(tick, 60_000);
