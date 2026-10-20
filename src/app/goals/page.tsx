import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { getDayWithGoals, listTemplates } from "@/lib/data";
import { planningDate } from "@/lib/plan";
import { localTime } from "@/lib/time";
import { GoalEditor } from "./goal-editor";

export default function GoalsPage({ searchParams }: PageProps<"/goals">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Goals searchParams={searchParams} />
    </Suspense>
  );
}

async function Goals({
  searchParams,
}: Pick<PageProps<"/goals">, "searchParams">) {
  const params = await searchParams;
  const user = await requireUser();
  const now = new Date();
  const date = planningDate(user, now);
  const isToday = date === localTime(now, user.timezone).date;
  const { goals } = await getDayWithGoals(user.id, date);
  const templates = await listTemplates(user.id);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">{isToday ? "Today's goals" : "Tomorrow's goals"}</h1>
        <p className="mt-1 text-muted">Up to five. I&apos;ll ask about one at a time.</p>
      </header>
      {params.full === "1" && (
        <p role="status" className="rounded-xl bg-gentle px-4 py-3">
          That shared goal was not added — five is the limit.
        </p>
      )}
      <GoalEditor
        // Remount after a save so newly created goals pick up their database ids.
        key={`${date}:${goals.map((g) => g.id).join(",")}`}
        date={date}
        done={goals.filter((g) => g.completed_at).map((g) => ({ id: g.id, title: g.title }))}
        open={goals.filter((g) => !g.completed_at).map((g) => ({ id: g.id, title: g.title }))}
        templates={templates.map((t) => ({ id: t.id, title: t.title }))}
        autoFocus={params.new === "1"}
      />
      <Nav />
    </div>
  );
}
