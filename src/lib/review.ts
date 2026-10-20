import type { Goal, NotYetReason } from "./types";
import { NOT_YET_REASONS } from "./types";

export type ReviewGoal = Pick<Goal, "title" | "completed_at" | "carried_from">;

export type ReviewDayInput = {
  date: string;
  goals: ReviewGoal[];
};

export type Review = {
  days: { date: string; total: number; done: number }[];
  total: number;
  done: number;
  rolled: { title: string; count: number }[];
  reasons: Record<NotYetReason, number>;
};

/**
 * Aggregates the last N days. Deliberately no streaks: a missed day is data, not
 * a failure. Rollovers are grouped by title so "this keeps coming back" is visible.
 */
export function summarizeReview(
  days: ReviewDayInput[],
  reasons: NotYetReason[] = [],
): Review {
  const rolled = new Map<string, { title: string; count: number }>();
  const reasonCounts = Object.fromEntries(
    NOT_YET_REASONS.map((r) => [r, 0]),
  ) as Record<NotYetReason, number>;

  for (const reason of reasons) reasonCounts[reason] += 1;

  let total = 0;
  let done = 0;
  const rows = days.map((day) => {
    const dayDone = day.goals.filter((g) => g.completed_at !== null).length;
    total += day.goals.length;
    done += dayDone;
    for (const goal of day.goals) {
      if (goal.carried_from === null) continue;
      const key = goal.title.trim().toLowerCase();
      if (!key) continue;
      const entry = rolled.get(key) ?? { title: goal.title.trim(), count: 0 };
      entry.count += 1;
      rolled.set(key, entry);
    }
    return { date: day.date, total: day.goals.length, done: dayDone };
  });

  return {
    days: rows,
    total,
    done,
    rolled: [...rolled.values()].sort(
      (a, b) => b.count - a.count || a.title.localeCompare(b.title),
    ),
    reasons: reasonCounts,
  };
}
