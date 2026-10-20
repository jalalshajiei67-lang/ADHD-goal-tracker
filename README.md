# PriorityPulse

A personal ADHD goal tracker PWA. Set up to five goals, ranked. The app asks about the top
unfinished one on a fixed interval until it's done, then moves to the next.

See `PLAN.md` for the original design decisions and `PLAN-V2.md` for the v2 additions.

## What it does

- Up to five ranked goals per day, dragged into priority order.
- Push check-ins with **Done**, plus **Not yet** with a reason (blocked / too big / not now /
  forgot) and **Ask again in 1 hour**.
- After two "not yet" answers it offers a **five-minute first step** for the goal.
- **Focus 25 min** from the check-in card pauses check-ins; Settings has longer presets.
- **Repeats**: save a goal once, then add it with one tap when planning tomorrow.
- **Share to add**: share a link or text from Android into the installed PWA.
- **Weekly review**: completion, rollovers and reasons for the last 7 or 30 days. No streaks.
- **Dictation** on browsers that support it (Chrome/Android); the button hides elsewhere.
- Nightly prompt, end-of-day summary, carry-over, and a heartbeat warning if the scheduler
  stops. Push sends retry transient failures.

## Stack

Next.js 16 (App Router) on Vercel Hobby · Supabase Postgres · Supabase Cron (pg_cron + pg_net)
calls `/api/cron/tick` every 5 min · Web Push (VAPID).

## Commands

```bash
npm run dev        # local dev server
npm test           # unit tests (scheduling, time/DST, push retry, review)
npm run test:db    # DB integration tests; skips without SUPABASE_TEST_URL
npm run typecheck
npm run lint
npm run build
```

## Setup

1. `node scripts/setup-env.mjs` creates `.env.local` with secrets and push keys.
2. Fill in `APP_PASSPHRASE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
3. Supabase SQL editor: run `supabase/migrations/0001_init.sql`, then `0002_trust.sql`,
   `0003_checkin_depth.sql` and `0004_repeats.sql`.
4. Deploy to Vercel with the same env vars.
5. Supabase SQL editor: fill the placeholders in `supabase/cron.sql` and run it.
6. Open the app on your phone, log in, install it (Chrome menu, then **Install app**), tap
   **Allow notifications**, then send a test notification from Settings.

Login is throttled: five failures per IP per 15 minutes.

### Sharing into the app

The manifest registers a `share_target` at `/share`. On Android Chrome, share a page from any
app and pick PriorityPulse; the first 120 characters become the last goal of the planning day.
If the session expired, the text is held in a short-lived cookie through login. iOS does not
support share targets.

### Database tests

Integration tests need a local Supabase (Docker):

```bash
npx supabase start        # applies supabase/migrations automatically
npm run test:db           # reads SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY
npx supabase stop
```

The CI workflow runs the unit/build job on every push and a separate database job. Integration
tests skip cleanly when the env vars are absent.

## Layout

- `src/lib/plan.ts`: pure scheduling decisions (what each tick should send). Unit-tested.
- `src/lib/time.ts`: timezone and minutes-of-day helpers, including the 24:00 window.
- `src/lib/tick.ts`: runs a tick: claims each action atomically, then sends the push.
- `src/lib/checkin.ts`: Done / Not yet / snooze / reason handling.
- `src/lib/review.ts`: pure weekly aggregation.
- `public/sw.js`: service worker (pushes, notification buttons, subscription rotation).
- `src/app/share/route.ts`: Android share target.
- `src/app/review/page.tsx`: 7/30-day review.
- `supabase/`: schema migrations and cron setup SQL.
