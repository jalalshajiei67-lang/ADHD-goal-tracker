import "server-only";
import { db, must, mustHave } from "./db";
import { getGoals, getOwnedGoal } from "./data";
import { activeGoal } from "./plan";
import { messages, sendPush } from "./push";
import { addMinutes } from "./time";
import type { CheckinResponse, User } from "./types";

export const SNOOZE_MIN = 60;

export type AckResult =
  | { ok: true; completedNow: boolean; next: { id: string; title: string } | null }
  | { ok: false; error: "not_found" };

/**
 * Records a response to a check-in. Idempotent: a second "done" for the same goal is a no-op.
 * `notify` sends a follow-up push; used when the response came from a notification button,
 * where there is no screen to show the acknowledgment on.
 */
export async function acknowledge(
  user: User,
  goalId: string,
  response: CheckinResponse,
  { notify = false } = {},
): Promise<AckResult> {
  const owned = await getOwnedGoal(user.id, goalId);
  if (!owned) return { ok: false, error: "not_found" };
  const now = new Date();
  const nowIso = now.toISOString();

  must(
    await db()
      .from("checkins")
      .update({ response, responded_at: nowIso })
      .eq("goal_id", goalId)
      .is("responded_at", null),
  );

  if (response === "snooze") {
    must(
      await db()
        .from("users")
        .update({ next_checkin_at: addMinutes(now, SNOOZE_MIN).toISOString() })
        .eq("id", user.id),
    );
  }

  let completedNow = false;
  if (response === "done") {
    const rows = mustHave(
      await db()
        .from("goals")
        .update({ completed_at: nowIso })
        .eq("id", goalId)
        .is("completed_at", null)
        .select("id"),
    );
    completedNow = rows.length > 0;
    if (completedNow) {
      // Next goal gets a full interval before its first check-in.
      must(
        await db()
          .from("users")
          .update({ next_checkin_at: addMinutes(now, user.checkin_interval_min).toISOString() })
          .eq("id", user.id),
      );
    }
  }

  const next = activeGoal(await getGoals(owned.goal.goal_day_id)) ?? null;

  if (completedNow && !next) {
    // Claim congrats so the tick doesn't send it again.
    const claimed = mustHave(
      await db()
        .from("goal_days")
        .update({ congrats_sent_at: nowIso })
        .eq("id", owned.goal.goal_day_id)
        .is("congrats_sent_at", null)
        .select("id"),
    );
    if (notify && claimed.length > 0) await sendPush(user, messages.congrats());
  } else if (completedNow && next && notify) {
    await sendPush(user, messages.next(next.title));
  }

  return { ok: true, completedNow, next: next ? { id: next.id, title: next.title } : null };
}
