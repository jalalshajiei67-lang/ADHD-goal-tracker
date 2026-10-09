import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { btn, card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDayWithGoals } from "@/lib/data";
import { CarryButton } from "./carry-button";

export default function SummaryPage({ params }: PageProps<"/summary/[date]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Summary params={params} />
    </Suspense>
  );
}

async function Summary({ params }: Pick<PageProps<"/summary/[date]">, "params">) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const user = await requireUser();
  const { goals } = await getDayWithGoals(user.id, date);
  const done = goals.filter((g) => g.completed_at);
  const open = goals.filter((g) => !g.completed_at);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">
          {goals.length ? `${done.length} of ${goals.length} done` : "No goals that day"}
        </h1>
      </header>

      {done.length > 0 && (
        <section className={`${card} flex flex-col gap-3`}>
          <h2 className="font-semibold">Finished</h2>
          <ul className="flex flex-col gap-2">
            {done.map((g) => (
              <li key={g.id} className="flex items-center gap-3">
                <span aria-hidden className="text-accent">
                  ✓
                </span>
                <span className="break-words">{g.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open.length > 0 && (
        <section className={`${card} flex flex-col gap-3`}>
          <h2 className="font-semibold">Maybe tomorrow?</h2>
          <ul className="flex flex-col gap-3">
            {open.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 break-words">{g.title}</span>
                <CarryButton goalId={g.id} date={date} />
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
