import Link from "next/link";
import { Suspense } from "react";
import { CheckinCard } from "@/components/checkin-card";
import { EnablePush } from "@/components/enable-push";
import { FocusCard } from "@/components/focus-card";
import { Nav } from "@/components/nav";
import { btn, card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDayWithGoals, lastCheckinAt, notYetInARow } from "@/lib/data";
import { activeGoal } from "@/lib/plan";
import { localTime, minutesOfDay } from "@/lib/time";

export default function HomePage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const user = await requireUser();
  const now = new Date();
  const local = localTime(now, user.timezone);
  const { goals } = await getDayWithGoals(user.id, local.date);
  const active = activeGoal(goals);
  const done = goals.filter((g) => g.completed_at !== null).length;
  const windowOver = minutesOfDay(local) >= user.checkin_end_hour * 60;
  const focusUntil =
    user.focus_until && new Date(user.focus_until) > now ? user.focus_until : null;

  let content;
  if (windowOver) {
    content = (
      <section className={`${card} flex flex-col gap-4`}>
        <h1 className="text-2xl font-bold">That&apos;s it for today</h1>
        {goals.length > 0 && (
          <p className="text-lg">
            {done} of {goals.length} done.
          </p>
        )}
        <Link href="/goals" className={btn.primary}>
          Plan tomorrow
        </Link>
        {goals.length > 0 && (
          <Link href={`/summary/${local.date}`} className={btn.secondary}>
            See today
          </Link>
        )}
        <Link href="/review" className={btn.secondary}>
          See the last 7 days
        </Link>
      </section>
    );
  } else if (goals.length === 0) {
    content = (
      <section className={`${card} flex flex-col gap-4`}>
        <h1 className="text-2xl font-bold">What matters today?</h1>
        <p className="text-muted">One goal is enough.</p>
        <Link href="/goals" className={btn.primary}>
          Add goals
        </Link>
      </section>
    );
  } else if (!active) {
    content = (
      <section className={`${card} flex flex-col items-center gap-4 text-center`}>
        <span className="animate-pop text-6xl" aria-hidden>
          ✓
        </span>
        <h1 className="text-2xl font-bold">All done for today</h1>
        <p className="text-muted">
          {done} of {goals.length} finished. Rest counts too.
        </p>
      </section>
    );
  } else if (focusUntil) {
    content = (
      <FocusCard goal={{ id: active.id, title: active.title }} until={focusUntil} />
    );
  } else {
    const last = await lastCheckinAt(user.id);
    const notYetCount = await notYetInARow(active.id);
    content = (
      <CheckinCard
        key={active.id}
        goal={{ id: active.id, title: active.title, nextStep: active.next_step }}
        doneToday={done}
        lastAskedAt={last?.toISOString() ?? null}
        notYetCount={notYetCount}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      {!user.push_subscription && <EnablePush />}
      {content}
      <Nav />
    </div>
  );
}
