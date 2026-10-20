import Link from "next/link";
import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { btn, card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getReviewDays, getReviewReasons } from "@/lib/data";
import { summarizeReview } from "@/lib/review";
import { addDays, localTime } from "@/lib/time";
import type { NotYetReason } from "@/lib/types";

type Props = { searchParams: Promise<{ range?: string }> };

const REASON_LABEL: Record<NotYetReason, string> = {
  blocked: "Blocked",
  too_big: "Too big",
  not_now: "Not now",
  forgot: "Forgot",
};

function formatDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function ReviewPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Review searchParams={searchParams} />
    </Suspense>
  );
}

async function Review({ searchParams }: Props) {
  const user = await requireUser();
  const params = await searchParams;
  const range = params.range === "30" ? 30 : 7;
  const end = localTime(new Date(), user.timezone).date;
  const start = addDays(end, -(range - 1));

  const [days, reasons] = await Promise.all([
    getReviewDays(user.id, start, end),
    getReviewReasons(user.id, new Date(`${start}T00:00:00Z`)),
  ]);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const filled = Array.from({ length: range }, (_, index) => {
    const date = addDays(start, index);
    return byDate.get(date) ?? { date, goals: [] };
  });
  const review = summarizeReview(filled, reasons);
  const percent = review.total ? Math.round((review.done / review.total) * 100) : 0;
  const tab =
    "flex min-h-12 flex-1 items-center justify-center rounded-xl border-2 font-medium";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Last {range} days</h1>
        <p className="text-muted">
          {review.total > 0
            ? `${review.done} of ${review.total} goals done (${percent}%).`
            : "No goals in this stretch. That's okay."}
        </p>
      </header>

      <div className="flex gap-2" role="group" aria-label="Range">
        <Link
          href="/review"
          aria-current={range === 7 ? "page" : undefined}
          className={`${tab} ${range === 7 ? "border-accent bg-accent-soft" : "border-line"}`}
        >
          7 days
        </Link>
        <Link
          href="/review?range=30"
          aria-current={range === 30 ? "page" : undefined}
          className={`${tab} ${range === 30 ? "border-accent bg-accent-soft" : "border-line"}`}
        >
          30 days
        </Link>
      </div>

      {review.total > 0 && (
        <section className={`${card} flex flex-col gap-4`}>
          <h2 className="text-xl font-semibold">Day by day</h2>
          <ul className="flex flex-col gap-2">
            {review.days.map((day) => {
              const dayPercent = day.total
                ? Math.round((day.done / day.total) * 100)
                : 0;
              return (
                <li key={day.date} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm text-muted">
                    {formatDay(day.date)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                    <span
                      className="block h-2 rounded-full bg-accent"
                      style={{ width: `${dayPercent}%` }}
                    />
                  </span>
                  <span className="w-10 text-right text-sm tabular-nums text-muted">
                    {day.total ? `${day.done}/${day.total}` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {review.rolled.length > 0 && (
        <section className={`${card} flex flex-col gap-3`}>
          <h2 className="text-xl font-semibold">Rolling over</h2>
          <p className="text-muted">
            These keep coming back. Shrink them, or let them go.
          </p>
          <ul className="flex flex-col gap-2">
            {review.rolled.map((item) => (
              <li key={item.title} className="flex items-center justify-between gap-3">
                <span className="min-w-0 break-words">{item.title}</span>
                <span className="shrink-0 text-sm text-muted">
                  {item.count} {item.count === 1 ? "rollover" : "rollovers"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reasons.length > 0 && (
        <section className={`${card} flex flex-col gap-3`}>
          <h2 className="text-xl font-semibold">What got in the way</h2>
          <ul className="flex flex-col gap-2">
            {(Object.keys(REASON_LABEL) as NotYetReason[])
              .filter((reason) => review.reasons[reason] > 0)
              .map((reason) => (
                <li key={reason} className="flex items-center justify-between gap-3">
                  <span>{REASON_LABEL[reason]}</span>
                  <span className="text-sm text-muted">
                    {review.reasons[reason]}{" "}
                    {review.reasons[reason] === 1 ? "time" : "times"}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <Link href="/goals" className={btn.primary}>
        Plan tomorrow
      </Link>
      <Nav />
    </div>
  );
}
