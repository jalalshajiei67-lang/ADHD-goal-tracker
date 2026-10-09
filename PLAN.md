# PriorityPulse — Build Plan (v1)

Supersedes the technical sections (§8–§13, §18) of the original spec. Product sections
(§1–§7: flows, ADHD principles) still apply except where noted here.

## Decisions

| # | Decision | Why |
|---|---|---|
| D-1 | Single user (me). Auth = one passphrase in `APP_PASSPHRASE`, login sets a long-lived signed httpOnly cookie. | Magic links open Safari, not the installed PWA. No email infra needed. Schema keeps `user_id` so multi-user stays possible. |
| D-2 | Scheduler = **Supabase Cron** (pg_cron + pg_net) calling `/api/cron/tick` every 5 min. No QStash, no Redis. | Two fewer services. Real per-user cadence instead of a global :00/:30 grid. |
| D-3 | Cadence via `users.next_checkin_at`. Every send is preceded by an atomic conditional `UPDATE … RETURNING` claim. | That claim *is* the dedupe lock. Claim-then-send = at-most-once (NFR: missed OK, duplicate not). |
| D-4 | Goals editable anytime (rename, reorder, delete incomplete). Max 5 per day. | Locked lists = friction = abandonment. Replaces FR-1.4 / EC-5. |
| D-5 | "Not yet" x3 unanswered on the same goal -> interval doubles to 60 min (not silence). | Resolves FR-2.6 vs §17 conflict without killing the loop. |
| D-6 | "Not yet" screen offers **Ask again in 1 h** (snooze). | OQ-1. Trivial with `next_checkin_at`. |
| D-7 | Interval configurable 15/30/60 min, default 30. | OQ-2. One column. |
| D-8 | Active window must not cross midnight (`start < end`). | Keeps date logic simple for v1. |
| D-9 | Primary test target: **Android** Chrome installed PWA (action buttons). iOS deep-link screen still built (it's also the fallback UI). | |
| D-10 | Deferred past v1 core: offline write queue, 7-day history, Focus mode, "skip today". | Core loop first. |

## Stack

Next.js (App Router, TypeScript) on Vercel Hobby · Supabase Postgres (+ pg_cron, pg_net, Vault) ·
`web-push` (VAPID, **Node runtime**, not Edge) · `vercel.json` has no crons.

DB access is server-only with the service-role key. RLS enabled on all tables with no policies
(anon key gets nothing).

## Schema

```sql
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  push_subscription     JSONB,
  timezone              TEXT NOT NULL DEFAULT 'UTC',
  nightly_hour          INT  NOT NULL DEFAULT 21 CHECK (nightly_hour BETWEEN 0 AND 23),
  checkin_start_hour    INT  NOT NULL DEFAULT 8  CHECK (checkin_start_hour BETWEEN 0 AND 23),
  checkin_end_hour      INT  NOT NULL DEFAULT 20 CHECK (checkin_end_hour BETWEEN 1 AND 24),
  checkin_interval_min  INT  NOT NULL DEFAULT 30 CHECK (checkin_interval_min IN (15, 30, 60)),
  next_checkin_at       TIMESTAMPTZ,              -- null = due now
  last_nightly_date     DATE,                     -- local date the nightly prompt was last sent
  focus_until           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (checkin_start_hour < checkin_end_hour)
);

CREATE TABLE goal_days (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_date         DATE NOT NULL,               -- user's local date
  nudge_sent_at     TIMESTAMPTZ,                 -- "set today's goals"
  congrats_sent_at  TIMESTAMPTZ,
  summary_sent_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, goal_date)
);

CREATE TABLE goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_day_id   UUID NOT NULL REFERENCES goal_days(id) ON DELETE CASCADE,
  priority      INT  NOT NULL CHECK (priority BETWEEN 1 AND 5),
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  completed_at  TIMESTAMPTZ,                     -- null = incomplete
  carried_from  UUID REFERENCES goals(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- DEFERRABLE so a reorder can swap priorities inside one transaction
  CONSTRAINT goals_day_priority_uniq UNIQUE (goal_day_id, priority) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE checkins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id       UUID REFERENCES goals(id) ON DELETE SET NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  response      TEXT CHECK (response IN ('done', 'not_yet', 'snooze'))
);

CREATE INDEX idx_checkins_goal  ON checkins(goal_id, sent_at DESC);
CREATE INDEX idx_goal_days_user ON goal_days(user_id, goal_date DESC);
```

Reorder/rewrite of a day's goals: delete incomplete goals + reinsert in one transaction (RPC
function), or rely on the deferred unique constraint.

## Tick: `POST /api/cron/tick` (every 5 min)

Auth: `Authorization: Bearer $CRON_SECRET`. Every "claim" below is a single conditional
`UPDATE … WHERE <not yet done> RETURNING`; send only if a row came back.

```
for each user with a push_subscription:
  local = now in user.timezone

  # 1. Nightly prompt (robust to missed ticks: ">= hour", once per local date)
  if local.hour >= nightly_hour:
     claim users.last_nightly_date = local.date  where it is distinct from local.date
     -> push "What are tomorrow's goals?"

  # 2. Outside window
  if local.hour >= checkin_end_hour:
     if goal_day(local.date) exists:
        claim goal_days.summary_sent_at  where null -> push "Today: X of Y done."
     continue
  if local.hour < checkin_start_hour: continue
  if focus_until > now: continue

  # 3. No goals today -> nudge, at most hourly (EC-1)
  day = goal_day(local.date); goals = day's goals
  if no goals:
     upsert goal_day; claim nudge_sent_at where null or < now - 60 min
     -> push "Set today's goals" (url /goals)
     continue

  # 4. All done -> congrats once (EC-2)
  active = first goal by priority where completed_at is null
  if not active:
     claim congrats_sent_at where null -> push congrats
     continue

  # 5. Check-in
  unanswered = count of trailing checkins for active with responded_at null
  gap = unanswered >= 3 ? 60 : checkin_interval_min
  claim users.next_checkin_at = now + gap  where next_checkin_at is null or <= now
  -> insert checkin(active) ; push check-in
```

Push send failures with 404/410 -> set `push_subscription = null` (EC-8 banner).

## Ack: `POST /api/checkin/ack` `{ goalId, response: done | not_yet | snooze }`

- `done`: set `completed_at` where null (idempotent, EC-4); mark open checkins answered;
  `next_checkin_at = now + interval`; push "Done. Next: {title}" or congrats (and set
  `congrats_sent_at`).
- `not_yet`: mark open checkins answered; leave `next_checkin_at` as-is.
- `snooze`: mark answered; `next_checkin_at = now + 60 min`.

Called from the service worker's `notificationclick` (Android action buttons, `credentials:
'include'`) and from `/checkin/[goalId]` screen (iOS / tap on body).

## Which date does goal entry target?

`/goals` edits **today** if local time < `checkin_end_hour`, otherwise **tomorrow**. Nightly
prompt deep-links to `/goals` (it fires after window end, so it lands on tomorrow).

## Supabase Cron setup

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('<CRON_SECRET>', 'cron_secret');
select cron.schedule('pulse-tick', '*/5 * * * *', $$
  select net.http_post(
    url     := 'https://<app>.vercel.app/api/cron/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type',  'application/json'),
    body    := '{}'::jsonb);
$$);
```

Side benefit: constant DB activity prevents the free-tier inactivity pause.

## Environment variables

`APP_PASSPHRASE`, `SESSION_SECRET`, `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:).

## Phases

| Phase | Deliverable | Exit |
|---|---|---|
| P0 Skeleton | Next.js app, Supabase migration, passphrase login, deploy to Vercel | Log in on phone, see empty home |
| P1 Goals | `/goals` entry: one field + Add, drag reorder, edit/delete, settings (tz, hours, interval) | AC-2 |
| P2 Push | Manifest, service worker, subscribe flow, test-push button | Push received on installed Android PWA |
| P3 Tick | `/api/cron/tick` + pg_cron schedule; tick logic as pure function with unit tests (fake clock) | AC-1, 3, 6, 7 + nudge/congrats/summary tests |
| P4 Response | Ack API, SW action handling, `/checkin/[goalId]` screen with Done / Not yet / Ask in 1 h, completion animation | AC-4 (30 min after Done), AC-5, iOS deep-link |
| P5 Summary + polish | Summary screen + Carry to tomorrow, onboarding, a11y pass (48px targets, contrast, reduced motion) | AC-8, NFRs |
| Later | Focus mode, 7-day history, offline queue, skip-today | — |

AC-10 (QStash budget) is obsolete. Replacement: tick route stays well under Vercel Hobby limits
(288 invocations/day).
