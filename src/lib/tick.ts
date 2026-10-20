import "server-only";
import { db, must, mustHave } from "./db";
import { getDayWithGoals, unansweredInARow } from "./data";
import { activeGoal, NUDGE_EVERY_MIN, planTick, type TickAction } from "./plan";
import { messages, sendPush } from "./push";
import { addMinutes, addDays, localTime, minutesOfDay } from "./time";
import type { GoalDay, User } from "./types";

/**
 * Every claim is one conditional UPDATE ... RETURNING. Only the caller that gets a
 * row back sends the push, so overlapping or retried ticks never double-send.
 */
async function claimed(query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const rows = must(await query);
  return (rows?.length ?? 0) > 0;
}

async function ensureDay(userId: string, date: string): Promise<GoalDay> {
  return mustHave(
    await db()
      .from("goal_days")
      .upsert({ user_id: userId, goal_date: date }, { onConflict: "user_id,goal_date" })
      .select("*")
      .single<GoalDay>(),
  );
}

async function run(user: User, action: TickAction, now: Date): Promise<string | null> {
  const nowIso = now.toISOString();
  switch (action.kind) {
    case "nightly": {
      const ok = await claimed(
        db()
          .from("users")
          .update({ last_nightly_date: action.localDate })
          .eq("id", user.id)
          .or(`last_nightly_date.is.null,last_nightly_date.neq.${action.localDate}`)
          .select("id"),
      );
      if (!ok) return null;
      await sendPush(user, messages.nightly());
      return "nightly";
    }
    case "summary": {
      const ok = await claimed(
        db()
          .from("goal_days")
          .update({ summary_sent_at: nowIso })
          .eq("id", action.dayId)
          .is("summary_sent_at", null)
          .select("id"),
      );
      if (!ok) return null;
      await sendPush(user, messages.summary(action.localDate, action.done, action.total));
      return "summary";
    }
    case "nudge": {
      const day = await ensureDay(user.id, action.localDate);
      const cutoff = addMinutes(now, -NUDGE_EVERY_MIN + 1).toISOString();
      const ok = await claimed(
        db()
          .from("goal_days")
          .update({ nudge_sent_at: nowIso })
          .eq("id", day.id)
          .or(`nudge_sent_at.is.null,nudge_sent_at.lt.${cutoff}`)
          .select("id"),
      );
      if (!ok) return null;
      await sendPush(user, messages.nudge());
      return "nudge";
    }
    case "congrats": {
      const ok = await claimed(
        db()
          .from("goal_days")
          .update({ congrats_sent_at: nowIso })
          .eq("id", action.dayId)
          .is("congrats_sent_at", null)
          .select("id"),
      );
      if (!ok) return null;
      await sendPush(user, messages.congrats());
      return "congrats";
    }
    case "checkin": {
      const ok = await claimed(
        db()
          .from("users")
          .update({ next_checkin_at: addMinutes(now, action.gapMin).toISOString() })
          .eq("id", user.id)
          .or(`next_checkin_at.is.null,next_checkin_at.lte.${nowIso}`)
          .select("id"),
      );
      if (!ok) return null;
      must(await db().from("checkins").insert({ user_id: user.id, goal_id: action.goal.id }));
      await sendPush(user, messages.checkin(action.goal.id, action.goal.title));
      return `checkin:${action.goal.id}`;
    }
  }
}

export async function runTick(now = new Date()) {
  const users = must(
    await db().from("users").select("*").not("push_subscription", "is", null),
  ) as User[];

  const results: Record<string, string[]> = {};
  for (const user of users) {
    const sent: string[] = [];
    try {
      must(
        await db().from("users").update({ last_tick_at: now.toISOString() }).eq("id", user.id),
      );
      const local = localTime(now, user.timezone);
      const { day, goals } = await getDayWithGoals(user.id, local.date);
      // A 24:00 end hour summarizes yesterday on ticks between midnight and the
      // next start hour, so fetch that day only in that narrow window.
      const previous =
        user.checkin_end_hour === 24 && minutesOfDay(local) < user.checkin_start_hour * 60
          ? await getDayWithGoals(user.id, addDays(local.date, -1))
          : undefined;
      const active = activeGoal(goals);
      const unanswered = active ? await unansweredInARow(active.id) : 0;
      const actions = planTick({
        user,
        now,
        day,
        goals,
        unansweredInARow: unanswered,
        previous,
      });
      // One push per tick: the planner already prioritizes.
      for (const action of actions.slice(0, 1)) {
        const result = await run(user, action, now);
        if (result) sent.push(result);
      }
    } catch (err) {
      console.error(`tick failed for user ${user.id}`, err);
      sent.push("error");
    }
    results[user.id] = sent;
  }
  return results;
}
