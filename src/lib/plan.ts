// Pure scheduling decisions. No I/O here so it can be unit-tested with a fake clock.
import type { Goal, GoalDay, User } from "./types";
import { addDays, localTime } from "./time";

/** Unanswered check-ins in a row after which the gap widens. */
export const SLOWDOWN_AFTER = 3;
export const SLOW_GAP_MIN = 60;
export const NUDGE_EVERY_MIN = 60;

export type TickAction =
  | { kind: "nightly"; localDate: string }
  | { kind: "summary"; dayId: string; done: number; total: number }
  | { kind: "nudge"; localDate: string }
  | { kind: "congrats"; dayId: string }
  | { kind: "checkin"; goal: Goal; gapMin: number };

export type TickInput = {
  user: User;
  now: Date;
  day: GoalDay | null; // goal_day for the user's local date
  goals: Goal[]; // goals of that day
  unansweredInARow: number; // trailing unanswered check-ins for the active goal
};

export function activeGoal(goals: Goal[]): Goal | undefined {
  return [...goals]
    .sort((a, b) => a.priority - b.priority)
    .find((g) => g.completed_at === null);
}

export function inWindow(user: User, hour: number): boolean {
  return hour >= user.checkin_start_hour && hour < user.checkin_end_hour;
}

/**
 * Which local date the goal editor should target: today while the check-in
 * window has not ended yet, tomorrow afterwards.
 */
export function planningDate(user: User, now: Date): string {
  const local = localTime(now, user.timezone);
  return local.hour < user.checkin_end_hour ? local.date : addDays(local.date, 1);
}

export function isCheckinDue(user: User, now: Date): boolean {
  return user.next_checkin_at === null || new Date(user.next_checkin_at) <= now;
}

/**
 * Decide what a tick should do for one user. Each returned action still has to be
 * claimed atomically in the database before its push is sent.
 */
export function planTick({ user, now, day, goals, unansweredInARow }: TickInput): TickAction[] {
  const actions: TickAction[] = [];
  const local = localTime(now, user.timezone);

  if (local.hour >= user.nightly_hour && user.last_nightly_date !== local.date) {
    actions.push({ kind: "nightly", localDate: local.date });
  }

  if (local.hour >= user.checkin_end_hour) {
    if (day && goals.length > 0 && day.summary_sent_at === null) {
      const done = goals.filter((g) => g.completed_at !== null).length;
      actions.push({ kind: "summary", dayId: day.id, done, total: goals.length });
    }
    return actions;
  }
  if (!inWindow(user, local.hour)) return actions;
  if (user.focus_until && new Date(user.focus_until) > now) return actions;

  if (goals.length === 0) {
    const last = day?.nudge_sent_at ? new Date(day.nudge_sent_at) : null;
    if (!last || now.getTime() - last.getTime() >= NUDGE_EVERY_MIN * 60_000) {
      actions.push({ kind: "nudge", localDate: local.date });
    }
    return actions;
  }

  const goal = activeGoal(goals);
  if (!goal) {
    if (day && day.congrats_sent_at === null) actions.push({ kind: "congrats", dayId: day.id });
    return actions;
  }

  if (isCheckinDue(user, now)) {
    const gapMin =
      unansweredInARow >= SLOWDOWN_AFTER
        ? Math.max(SLOW_GAP_MIN, user.checkin_interval_min)
        : user.checkin_interval_min;
    actions.push({ kind: "checkin", goal, gapMin });
  }
  return actions;
}
