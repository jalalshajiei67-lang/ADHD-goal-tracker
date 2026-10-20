# PriorityPulse — Plan for All 12 Improvements

Status: **implemented.** See `README.md` for setup and `PLAN.md` for the recorded decisions.
Scope: the twelve items from the review, grouped into six independently shippable phases.
Assumption: still one user and one push device. Multi-user remains out of scope.

## At a glance

| Phase | Items | Outcome | Est. |
|---|---|---|---|
| 0. Safety net | E12 (part 1) | Baseline green + pure tests for time/DST | 0.5 d |
| 1. Trust | F1, F2, F3, E10, E11 | The app can no longer fail silently | 2 d |
| 2. Better check-ins | P9, P4, P7 | Reasons, next step, focus timer | 3 d |
| 3. Planning & capture | P5, P8 | Repeats and share-to-add | 3 d |
| 4. Reflection | P6 | Gentle 7/30-day review | 2 d |
| 5. Hardening | E12 (part 2) | DB integration tests, CI, docs, a11y | 2 d |

Roughly 12.5 focused days, with device testing as the real bottleneck. Each phase ends
with `test`, `typecheck`, `lint`, `build` green and a manual check on an installed PWA.

## Decisions I recommend (say if you want otherwise)

| # | Decision | Alternative |
|---|---|---|
| D-11 | `checkin_end_hour = 24` means "check-ins until midnight". The summary for that day is sent on the first tick after midnight, before the next window starts. Compare minutes-of-day, not hours. | Cap the setting at 23:59 and drop the 24 option. |
| D-12 | Push send retries transient failures (network, 429, 5xx) up to 3 times with short backoff. 404/410 still clears the subscription; 400/401/403 never retry. | Keep at-most-once strictly, accept missed pushes. |
| D-13 | Heartbeat is two columns: `users.last_tick_at` and `users.last_push_at`. Settings shows both and warns if no tick for 15 min. | Separate `ticks` table and a health endpoint. |
| D-14 | "Make it smaller" stores **one** `next_step` per goal (160 chars), shown on the check-in card. No subtasks table. | Full subtasks with per-step check-ins. |
| D-15 | Reasons live on `checkins.reason` (`blocked`, `too_big`, `not_now`, `forgot`), chosen after tapping Not yet. | Reason on the goal (loses history). |
| D-16 | Focus presets are 25 min on the check-in card and 1/2/4 h in Settings, both writing `focus_until`. | Separate timers per surface. |
| D-17 | Repeats are **one-tap suggestion chips**, not auto-created goals. Saving a goal as a repeat is a per-row action. | Auto-materialize repeats every day at rollover. |
| D-18 | Share-to-add inserts the goal directly (clamped to 120 chars) and redirects to `/goals`. A short-lived cookie carries the text through login. | Pre-fill the editor with the shared text. |
| D-19 | Review shows completion, rollovers and reasons. **No streaks.** | Streak counter. |
| D-20 | Push stays single-device (last subscriber wins), surfaced clearly in Settings. | `push_subscriptions` table for multiple devices. |
| D-21 | Login limit: 5 failures per IP per 15 min, DB-backed, cleared on success. | In-memory limiter (unreliable on serverless). |
| D-22 | DB integration tests run when `SUPABASE_TEST_URL` is set, and in a separate CI job with local Supabase. Pure tests always run. | Mock-only tests. |

## Schema changes

All migrations are additive and live in `supabase/migrations/`. Run the migration first,
then deploy the matching code. Existing rows keep working if code is rolled back.

### `0002_trust.sql` — heartbeat + login limiting

```sql
alter table users add column last_tick_at timestamptz;
alter table users add column last_push_at timestamptz;

create table login_attempts (
  id           bigserial primary key,
  ip           text not null,
  attempted_at timestamptz not null default now()
);
create index login_attempts_ip_time on login_attempts (ip, attempted_at desc);
alter table login_attempts enable row level security;
```

### `0003_checkin_depth.sql` — reasons + next step

```sql
alter table goals add column next_step text
  check (next_step is null or char_length(next_step) between 1 and 160);

alter table checkins add column reason text
  check (reason is null or reason in ('blocked', 'too_big', 'not_now', 'forgot'));
```

No change needed to `save_goals`: it already updates only priority/title, so `next_step`
survives reorders and renames.

### `0004_repeats.sql` — repeat suggestions

```sql
create table goal_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now()
);
create unique index goal_templates_user_title
  on goal_templates (user_id, lower(title));
alter table goal_templates enable row level security;
```

---

## Phase 0 — Safety net (0.5 d)

**Goal:** know the baseline and lock down the time logic before changing it.

- [ ] Run and record: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- [ ] Add `src/lib/time.test.ts`: `localTime` in Berlin (CET/CEST), New York, Kolkata,
      Kiritimati; `addDays` across DST and month ends; `formatElapsed`; invalid zones.
- [ ] Add failing tests for the `end_hour = 24` behavior from F1 (test-first).
- [ ] Add `src/lib/plan.test.ts` cases for minutes-of-day boundaries (`07:59`, `08:00`,
      `19:59`, `20:00`).
- [ ] Create `vitest.integration.mts` and guard DB tests with
      `describe.skipIf(!process.env.SUPABASE_TEST_URL)`.
- [ ] Add `npm run test:db` (skips cleanly when no test DB is configured).

**Exit:** baseline is documented; new tests fail for the expected reason, not for setup.

## Phase 1 — Trust: never fail silently (2 d)

### F1. `end_hour = 24` and planning cutoff

- [ ] `src/lib/time.ts`: add `minutesOfDay(local)`.
- [ ] `src/lib/plan.ts`:
  - [ ] Replace hour comparisons in `inWindow` with minute comparisons.
  - [ ] Add `summaryTarget(user, local, previous)` so `end_hour = 24` summarizes
        **yesterday** on ticks between midnight and the next start hour.
  - [ ] `planningDate`: cutoff is `end_hour * 60`, except `end_hour = 24`, where it is
        `nightly_hour * 60` (so the 21:00 nightly prompt still targets tomorrow).
  - [ ] Send at most **one** push per tick. Priority: nightly → summary → congrats/nudge →
        check-in. At 21:00 this stops "plan tomorrow" and "today's summary" arriving together.
- [ ] `src/lib/tick.ts`: fetch the previous day's goals only when the post-midnight summary
      path applies.
- [ ] `src/app/page.tsx`: use minute-of-day for `windowOver`.
- [ ] `src/app/settings/settings-form.tsx`: label 24 as midnight; hint that the nightly hour
      lands on tomorrow; reject `start = 0` with `end = 24` (there is no post-midnight gap
      left to send that day's summary).
- [ ] Tests: end=24 at 23:55 (no summary), 00:05 (yesterday summary), 08:00 (nothing),
      end=20 at 20:05 (today summary), planningDate at 21:00 with end=24 → tomorrow,
      nightly + summary collision → only nightly this tick.

### F2. Push retry

- [ ] `src/lib/push.ts`: injectable sender, retry on network/429/5xx (3 attempts, 250 ms and
      1 s backoff), never retry 400/401/403, clear subscription on 404/410.
- [ ] Update `last_push_at` on success only, best-effort: a failed heartbeat write must not
      turn a delivered push into an error.
- [ ] `src/lib/push.test.ts`: retry-then-success, 410 clears, 400 does not retry, all attempts
      fail throws, `last_push_at` untouched on failure.
- [ ] Keep duplicate risk low: same notification `tag` collapses repeats in the tray.

### F3. Heartbeat

- [ ] `src/lib/tick.ts`: stamp `last_tick_at` for every user with a push subscription, even
      when no action fires.
- [ ] `src/lib/types.ts`: add `last_tick_at`, `last_push_at`; update the test user factory.
- [ ] `src/app/settings/push-status.tsx` (+ page): show "Checked N ago" and "Last notification
      N ago"; warn when the last tick is older than 15 min.
- [ ] Extract `healthState(lastTickAt, now)` into a pure helper and unit-test it.
- [ ] Optional: `/api/health` guarded by `CRON_SECRET`, plus a GitHub Actions daily check that
      fails loudly if ticks stop. The in-app warning is the required part.

### E10. Subscription rotation

- [ ] `public/sw.js`: add `pushsubscriptionchange`; reuse
      `oldSubscription.options.applicationServerKey` to resubscribe, POST to
      `/api/push/subscribe`, tell open windows to refresh.
- [ ] `src/app/api/push/key/route.ts`: public VAPID public key fallback for resubscribe.
- [ ] `src/proxy.ts`: allow `/api/push/key` through without a session.
- [ ] Manual: unregister the SW, reconnect, confirm Settings still reports this device and a
      test push arrives. (Chrome does not expose a simple rotate button.)

### E11. Login rate limit

- [ ] `src/lib/rate-limit.ts`: `clientIp(headers)`, `loginAllowed(ip, now)`,
      `recordFailure(ip, now)`, `clearFailures(ip)`, 5 failures / 15 min.
- [ ] `src/app/actions.ts` `login`: check before verifying, record on failure, clear on
      success, return "Too many attempts. Try again in N min."
- [ ] Opportunistically delete attempts older than a day on each check; the table stays tiny.
- [ ] Tests: 5 failures block the 6th, window expiry unblocks, success clears, `retryAfter`
      rounding.
- [ ] Integration: DB-backed counts survive across processes (Phase 5).

**Exit:** no silent failures — a dead cron, a rotating subscription, a transient push error,
and a brute-force attempt all have a visible or logged outcome. Migrate `0002`, deploy.

## Phase 2 — Better check-ins (3 d)

### P9. "Not yet" reasons

- [ ] `src/lib/types.ts`: `NotYetReason`.
- [ ] `src/lib/checkin.ts`: `acknowledge` returns the latest `checkinId` and accepts an optional
      reason; add `setNotYetReason(user, checkinId, reason)` with ownership check.
- [ ] `src/app/actions.ts`: `respond(goalId, response)` returns `checkinId`; add
      `setNotYetReason(checkinId, reason)`.
- [ ] `src/components/checkin-card.tsx`: after Not yet, show four 48 px chips plus Skip.
      Selecting one updates the recorded check-in; an `aria-live` note confirms it.
- [ ] No reason UI on notification actions (only Done exists there).
- [ ] Tests: reason stored, ownership enforced, `done` still idempotent, unknown reason rejected.

### P4. Make it smaller

- [ ] `src/lib/data.ts`: `notYetInARow(goalId)` (last check-ins where `response = 'not_yet'`).
- [ ] `src/app/actions.ts`: `saveNextStep(goalId, text)` (1–160 chars, owned) and
      `clearNextStep(goalId)`.
- [ ] `src/components/checkin-card.tsx`: show "First step: …" when set; show a gentle
      "Too big? Pick a 5-minute first step" form after 2 Not-yets or after choosing
      `too_big`.
- [ ] `src/app/page.tsx`, `src/app/checkin/[goalId]/page.tsx`: pass `nextStep` and
      `notYetCount`.
- [ ] Deliberately **not** doing "step done" or nested subtasks in this pass.
- [ ] Tests: validation boundaries, ownership, empty text clears the step.

### P7. Focus timer on the card

- [ ] `src/app/actions.ts`: replace `setFocus(hours)` with `setFocus(minutes)`; Settings passes
      60/120/240, the card passes 25.
- [ ] `src/components/checkin-card.tsx`: quiet "Focus 25 min" button.
- [ ] `src/components/focus-card.tsx` (new): goal title, live countdown, "I finished this"
      (done), "End focus"; `aria-live` off for the countdown.
- [ ] `src/app/page.tsx`: when `focus_until > now`, render the focus card instead of the
      check-in card.
- [ ] `src/app/settings/focus-mode.tsx`: keep hour presets, call minutes API, label clearly.
- [ ] Tests: expired focus no longer suppresses; active focus suppresses (already covered);
      minute validation.

**Exit:** the loop asks a better question and offers a way to start. Migrate `0003`, deploy.

## Phase 3 — Planning and capture (3 d)

### P5. Repeat suggestions

- [ ] `src/lib/data.ts`: `listTemplates`, `saveTemplate` (case-insensitive upsert),
      `deleteTemplate`.
- [ ] `src/app/actions.ts`: thin server actions for the three.
- [ ] `src/app/goals/page.tsx`: load templates, pass to the editor.
- [ ] `src/app/goals/goal-editor.tsx`: a "Repeats" chip row above the input; tap appends a
      draft if under five; an Edit mode reveals delete buttons.
- [ ] Per-row "↻ Save as repeat" action; optimistic local update, no page refresh (avoids
      losing unsaved drafts).
- [ ] No automatic materialization. The nightly prompt lands on `/goals`, one tap from a
      repeated goal.
- [ ] Tests: dedupe `Gym`/`gym`, delete, ownership, max-five behavior when adding chips.

### P8. Share-to-add and app shortcut

- [ ] `src/app/manifest.ts`: `share_target` (`POST /share`, multipart, title/text/url) and a
      "Add a goal" shortcut to `/goals?new=1`. Cast the object if Next's manifest type lags the
      spec.
- [ ] `src/app/share/route.ts`:
  - [ ] `POST`: parse form data, clamp to 120 chars, insert into the planning day, redirect to
        `/goals` (or `/goals?full=1`).
  - [ ] If signed out: put the text in a 10-minute httpOnly `pp_share` cookie and redirect to
        `/login?next=/share`.
  - [ ] `GET`: consume the cookie, insert, redirect (post-login path).
- [ ] `src/proxy.ts`: exclude `/share` so the POST body is not lost to a redirect.
- [ ] `src/app/goals/page.tsx` / editor: focus the input when `?new=1`; show the "five is
      plenty" message when `?full=1`.
- [ ] `src/components/voice-input.tsx` (stretch): `webkitSpeechRecognition`, feature-detected,
      appends to the draft; hidden where unsupported.
- [ ] Tests: manifest includes both entries, share clamps/strips newlines, signed-out cookie
      handoff, full day, invalid body.
- [ ] Manual: share a web page from Chrome Android into the installed PWA.

**Exit:** planning tomorrow takes one tap for repeat goals; capturing a thought takes one
share. Migrate `0004`, deploy.

## Phase 4 — Weekly review (2 d)

- [ ] `src/lib/review.ts` (pure): `summarizeReview(days, checkins)` → per-day done/total,
      overall, rollover counts by normalized title, reason counts.
- [ ] `src/lib/data.ts`: range query for `goal_days` + `goals` and check-in reasons over the
      last 7 or 30 local dates.
- [ ] `src/app/review/page.tsx` (new): "Last 7 days" with a 7/30 toggle via `?range=`;
      completion summary; gentle day rows; "rolling over" list ("shrunk or retired?"); reason
      breakdown; empty state.
- [ ] `src/components/nav.tsx`: add Review; switch to `flex-1 min-w-0` so four labels fit at
      320 px. Verify keyboard order and 48 px targets.
- [ ] Link from the end-of-day home card ("See the last 7 days").
- [ ] Tests: fixtures for mixed days, rollover grouping, reason counts, empty range, DST date
      range, invalid range param falls back to 7.
- [ ] Copy check: no streaks, no red, no "failed" language.

## Phase 5 — Hardening, CI, docs (2 d)

### E12. Tests and CI

- [ ] `supabase/config.toml` + local Supabase instructions.
- [ ] DB integration tests:
  - [ ] `save_goals`: reorder, delete incomplete, preserve completed, max five, cross-user
        isolation.
  - [ ] `carry_goal`: added / exists / full / not_found.
  - [ ] `acknowledge`: done idempotency, reason persistence, snooze sets `next_checkin_at`.
  - [ ] Claim concurrency: two simultaneous ticks produce one check-in row and one push.
  - [ ] Rate limiter across two clients.
- [ ] `.github/workflows/ci.yml`: install, lint, typecheck, unit tests, build.
- [ ] Separate `db` job: Supabase CLI + `supabase start` + `npm run test:db`.
- [ ] DST suite as in Phase 0, now including `planningDate` around midnight and end=24.

### Docs and polish

- [ ] `README.md`: new features, migrations 0002–0004, `test:db`, device matrix, share target
      install note (Android only).
- [ ] `PLAN.md`: record D-11…D-22 as decisions, superseding the old "deferred" list.
- [ ] Accessibility pass: chips, focus card, review bars, nav at 320 px, reduced motion,
      `aria-live` for reasons/celebrations.
- [ ] Security pass: `npm audit`, cookie flags, RLS still enabled, secrets not logged, IP
      header trust documented.
- [ ] Optional: daily GitHub Actions health check hitting `/api/health`.

**Exit:** CI is green from a clean clone; local DB tests documented; README matches reality.

## Testing strategy

| Layer | What | Where |
|---|---|---|
| Unit | `plan`, `time`/DST, `review`, `rate-limit`, `push` retry, `healthState` | `src/lib/*.test.ts` |
| Integration | RPCs, claims, auth/rate limit, share route | `*.db.test.ts`, local Supabase |
| Manual | Android installed PWA: actions, alarm, share, focus; iOS: deep link, no actions; desktop: layout, keyboard | device checklist per phase |

Every phase must pass: `npm test && npm run typecheck && npm run lint && npm run build`, plus
its listed manual checks. The concurrency test is non-negotiable — at-most-once is the app's
core promise.

## Rollout and rollback

1. Back up the database (`pg_dump`) before `0003`/`0004` if the data matters.
2. Apply the phase migration in the Supabase SQL editor.
3. Deploy the phase; smoke-test one real push and one real check-in response.
4. Keep phases as separate PRs/commits so any one can be reverted.
5. Rollback = revert the deploy. Do **not** drop the new columns/tables; old code ignores them.

## Risks

| Risk | Mitigation |
|---|---|
| Post-midnight summary is missed if ticks stop overnight | Heartbeat warns; tick is every 5 min; acceptable for one user |
| Retry duplicates a push | Same `tag` collapses notifications; cap at 3 attempts |
| `next_step` grows into a subtask system | One field, no step completion in this pass |
| Repeat chips clutter the editor | Suggestions only, explicit add, Edit mode to delete |
| Shared text lost at login | Short-lived cookie; `/share` excluded from the auth proxy |
| Rate limit locks me out | 5/15 is generous; success clears; document `SESSION_SECRET`/DB reset |
| Local Supabase/CI is slow or flaky | DB job separate from unit CI; tests skip without the env var |
| Review has little data at first | Empty states; 7-day default; no backfill promises |
| iOS lacks action buttons and share target | Existing deep-link screen remains the fallback; note in README |

## Explicitly out of scope

- Multi-user (`getOrCreateUser` still picks the first row; the `user_id` columns remain
  aspirational).
- Offline write queue / Background Sync.
- Multiple push devices.
- Automatic recurring-goal creation (repeats are suggestions).
- Subtasks, streaks, gamification.

## Decisions recorded

All defaults above were implemented. The alternatives remain useful if the product direction
changes later.

1. One `next_step` field, not subtasks.
2. Repeats as one-tap chips, not auto-added daily.
3. Share-to-add inserts directly.
4. DB tests run in a separate CI job with local Supabase.
5. A 24:00 window summarizes after midnight.
