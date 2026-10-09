// Creates .env.local with fresh random secrets and VAPID keys. Never overwrites an existing file.
// Run: node scripts/setup-env.mjs
// Then fill in APP_PASSPHRASE, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY by hand.
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import webpush from "web-push";

const file = ".env.local";
if (existsSync(file)) {
  console.log(`${file} already exists; leaving it alone.`);
  process.exit(0);
}

const secret = () => randomBytes(32).toString("base64url");
const vapid = webpush.generateVAPIDKeys();

writeFileSync(
  file,
  `# Local secrets. Never commit. Copy the same values into Vercel env vars.
APP_PASSPHRASE=
SESSION_SECRET=${secret()}
CRON_SECRET=${secret()}

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=mailto:you@example.com
`,
);
console.log(`Wrote ${file}. Now fill in APP_PASSPHRASE, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
