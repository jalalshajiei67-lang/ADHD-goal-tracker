import "server-only";
import { db, must, mustHave } from "./db";
import type { Goal, GoalDay, User } from "./types";

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

export async function carryGoal(userId: string, goalId: string, date: string): Promise<CarryResult> {
  return must(
    await db().rpc("carry_goal", { p_user: userId, p_goal: goalId, p_date: date }),
  ) as CarryResult;
}
