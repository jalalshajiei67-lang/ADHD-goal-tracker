# PriorityPulse

A personal ADHD goal tracker PWA. Set up to five goals, ranked. The app asks about the top
unfinished one on a fixed interval until it's done, then moves to the next.

See `PLAN.md` for the design decisions.

## Stack

Next.js 16 (App Router) on Vercel Hobby · Supabase Postgres · Supabase Cron (pg_cron + pg_net)
calls `/api/cron/tick` every 5 min · Web Push (VAPID).

## Commands

```bash
npm run dev        # local dev server
npm test           # unit tests (scheduling logic, sessions)
npm run typecheck
npm run lint
npm run build
```

## Setup

1. `node scripts/setup-env.mjs` creates `.env.local` with secrets and push keys.
2. Fill in `APP_PASSPHRASE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
3. Supabase SQL editor: run `supabase/migrations/0001_init.sql`.
4. Deploy to Vercel with the same env vars.
5. Supabase SQL editor: fill the placeholders in `supabase/cron.sql` and run it.
6. Open the app on your phone, log in, install it (Chrome menu, then **Install app**), tap
   **Allow notifications**, then send a test notification from Settings.

## Layout

- `src/lib/plan.ts`: pure scheduling decisions (what each tick should send). Unit-tested.
- `src/lib/tick.ts`: runs a tick: claims each action atomically in the DB, then sends the push.
- `src/lib/checkin.ts`: Done / Not yet / snooze handling.
- `public/sw.js`: service worker (shows pushes, handles notification buttons).
- `supabase/`: schema migration and cron setup SQL.
