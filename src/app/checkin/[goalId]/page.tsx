import Link from "next/link";
import { Suspense } from "react";
import { CheckinCard } from "@/components/checkin-card";
import { Nav } from "@/components/nav";
import { btn, card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getGoals, getOwnedGoal, lastCheckinAt } from "@/lib/data";

// Deep-link target of a check-in notification (the only path on iOS, which has no action buttons).
export default function CheckinPage({ params, searchParams }: PageProps<"/checkin/[goalId]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Checkin params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Checkin({
  params,
  searchParams,
}: Pick<PageProps<"/checkin/[goalId]">, "params" | "searchParams">) {
  const { goalId } = await params;
  const ring = (await searchParams).alarm === "1";
  const user = await requireUser();
  const owned = await getOwnedGoal(user.id, goalId);

  if (!owned || owned.goal.completed_at) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <section className={`${card} flex flex-col gap-4`}>
          <h1 className="text-2xl font-bold">{owned ? "Already done ✓" : "Goal not found"}</h1>
          <Link href="/" className={btn.primary}>
            See what&apos;s next
          </Link>
        </section>
        <Nav />
      </div>
    );
  }

  const goals = await getGoals(owned.goal.goal_day_id);
  const last = await lastCheckinAt(user.id);
  return (
    <div className="flex flex-1 flex-col gap-6">
      <CheckinCard
        goal={{ id: owned.goal.id, title: owned.goal.title }}
        doneToday={goals.filter((g) => g.completed_at).length}
        lastAskedAt={last?.toISOString() ?? null}
        ring={ring}
      />
      <Nav />
    </div>
  );
}
