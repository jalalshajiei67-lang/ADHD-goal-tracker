// Checks local setup without printing any secret values.
// Run: node scripts/check-setup.mjs
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const required = [
  "APP_PASSPHRASE",
  "SESSION_SECRET",
  "CRON_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
];

let ok = true;
for (const name of required) {
  const set = Boolean(process.env[name]?.trim());
  if (!set) ok = false;
  console.log(`${set ? "✓" : "✗"} ${name}${set ? "" : "  (missing)"}`);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) {
    console.log("! SUPABASE_URL should look like https://<project-ref>.supabase.co");
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  for (const table of ["users", "goal_days", "goals", "checkins"]) {
    const { error } = await db.from(table).select("id", { head: true, count: "exact" });
    if (error) ok = false;
    console.log(`${error ? "✗" : "✓"} table ${table}${error ? `: ${error.message}` : ""}`);
  }
}

console.log(ok ? "\nSetup looks good." : "\nSome things need fixing (see ✗ above).");
process.exit(ok ? 0 : 1);
