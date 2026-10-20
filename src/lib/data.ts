import "server-only";
import { db, must, mustHave } from "./db";
import type { Goal, GoalDay, GoalTemplate, NotYetReason, User } from "./types";
import { NOT_YET_REASONS } from "./types";
import type { ReviewDayInput } from "./review";

/** The single app user. Created on first use. */
export async function getOrCreateUser(): Promise<User> {
  const existing = must(
    await db().from("users").select("*").order("created_at").limit(1).maybeSingle<User>(),
  );
  if (existing) return existing;
  return mustHave(await db().from("users").insert({}).select("*").single<User>());
}

export async function updateUser(id: string, fields: Partial<User>): Promise<void> {
  must(await db().from("users").update(fields).eq("id", id));
}

export async function setNextStep(goalId: string, nextStep: string | null): Promise<void> {
  must(await db().from("goals").update({ next_step: nextStep }).eq("id", goalId));
}

export async function getDay(userId: string, date: string): Promise<GoalDay | null> {
  return must(
    await db()
      .from("goal_days")
      .select("*")
      .eq("user_id", userId)
      .eq("goal_date", date)
      .maybeSingle<GoalDay>(),
  );
}

export async function getGoals(dayId: string): Promise<Goal[]> {
  return must(
    await db().from("goals").select("*").eq("goal_day_id", dayId).order("priority"),
  ) as Goal[];
}

export async function getDayWithGoals(userId: string, date: string) {
  const day = await getDay(userId, date);
  const goals = day ? await getGoals(day.id) : [];
  return { day, goals };
}

/** Goal plus the day it belongs to, only if it belongs to this user. */
export async function getOwnedGoal(userId: string, goalId: string) {
  const row = must(
    await db()
      .from("goals")
      .select("*, goal_days!inner(user_id, goal_date)")
      .eq("id", goalId)
      .eq("goal_days.user_id", userId)
      .maybeSingle(),
  ) as (Goal & { goal_days: { user_id: string; goal_date: string } }) | null;
  if (!row) return null;
  const { goal_days, ...goal } = row;
  return { goal: goal as Goal, date: goal_days.goal_date };
}

/** Number of most recent check-ins for this goal that got no response, in a row. */
export async function unansweredInARow(goalId: string, limit = 3): Promise<number> {
  const rows = must(
    await db()
      .from("checkins")
      .select("responded_at")
      .eq("goal_id", goalId)
      .order("sent_at", { ascending: false })
      .limit(limit),
  ) as { responded_at: string | null }[];
  let n = 0;
  for (const r of rows) {
    if (r.responded_at !== null) break;
    n++;
  }
  return n;
}

/** Trailing "not yet" answers for this goal. Used to offer a smaller first step. */
export async function notYetInARow(goalId: string, limit = 3): Promise<number> {
  const rows = must(
    await db()
      .from("checkins")
      .select("response")
      .eq("goal_id", goalId)
      .order("sent_at", { ascending: false })
      .limit(limit),
  ) as { response: string | null }[];
  let n = 0;
  for (const r of rows) {
    if (r.response !== "not_yet") break;
    n++;
  }
  return n;
}

export async function lastCheckinAt(userId: string): Promise<Date | null> {
  const row = must(
    await db()
      .from("checkins")
      .select("sent_at")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ sent_at: string }>(),
  );
  return row ? new Date(row.sent_at) : null;
}

export async function saveGoals(
  userId: string,
  date: string,
  goals: { id: string | null; title: string }[],
): Promise<void> {
  must(await db().rpc("save_goals", { p_user: userId, p_date: date, p_goals: goals }));
}

export type CarryResult = "added" | "exists" | "full" | "not_found";

export async function listTemplates(userId: string): Promise<GoalTemplate[]> {
  return must(
    await db()
      .from("goal_templates")
      .select("*")
      .eq("user_id", userId)
      .order("created_at"),
  ) as GoalTemplate[];
}

/** Case-insensitive: "Gym" and "gym" are the same repeat. */
export async function saveTemplate(userId: string, title: string): Promise<void> {
  const clean = title.trim().slice(0, 120);
  if (!clean) return;
  const existing = await listTemplates(userId);
  if (existing.some((t) => t.title.toLowerCase() === clean.toLowerCase())) return;
  must(await db().from("goal_templates").insert({ user_id: userId, title: clean }));
}

export async function deleteTemplate(userId: string, id: string): Promise<void> {
  must(await db().from("goal_templates").delete().eq("user_id", userId).eq("id", id));
}

export async function getReviewDays(
  userId: string,
  start: string,
  end: string,
): Promise<ReviewDayInput[]> {
  const rows = must(
    await db()
      .from("goal_days")
      .select("goal_date, goals(title, completed_at, carried_from)")
      .eq("user_id", userId)
      .gte("goal_date", start)
      .lte("goal_date", end)
      .order("goal_date"),
  ) as {
    goal_date: string;
    goals: { title: string; completed_at: string | null; carried_from: string | null }[];
  }[];

  return rows.map((r) => ({ date: r.goal_date, goals: r.goals ?? [] }));
}

export async function getReviewReasons(
  userId: string,
  since: Date,
): Promise<NotYetReason[]> {
  const rows = must(
    await db()
      .from("checkins")
      .select("reason")
      .eq("user_id", userId)
      .gte("sent_at", since.toISOString())
      .not("reason", "is", null),
  ) as { reason: string }[];
  return rows
    .map((r) => r.reason)
    .filter((r): r is NotYetReason => (NOT_YET_REASONS as readonly string[]).includes(r));
}

/** Adds a shared goal at the end of the day's list. */
export async function appendGoal(
  userId: string,
  date: string,
  title: string,
): Promise<"added" | "full"> {
  const { goals } = await getDayWithGoals(userId, date);
  if (goals.length >= 5) return "full";

  const list: { id: string | null; title: string }[] = [...goals]
    .sort((a, b) => a.priority - b.priority)
    .map((g) => ({ id: g.id, title: g.title }));
  list.push({ id: null, title: title.trim().slice(0, 120) });
  await saveGoals(userId, date, list);
  return "added";
}

export async function carryGoal(userId: string, goalId: string, date: string): Promise<CarryResult> {
  return must(
    await db().rpc("carry_goal", { p_user: userId, p_goal: goalId, p_date: date }),
  ) as CarryResult;
}
