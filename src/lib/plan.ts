// Pure scheduling decisions. No I/O here so it can be unit-tested with a fake clock.
import type { Goal, GoalDay, User } from "./types";
import { addDays, localTime, minutesOfDay, type LocalTime } from "./time";

/** Unanswered check-ins in a row after which the gap widens. */
export const SLOWDOWN_AFTER = 3;
export const SLOW_GAP_MIN = 60;
export const NUDGE_EVERY_MIN = 60;

export type TickAction =
  | { kind: "nightly"; localDate: string }
  | { kind: "summary"; dayId: string; done: number; total: number; localDate: string }
  | { kind: "nudge"; localDate: string }
  | { kind: "congrats"; dayId: string }
  | { kind: "checkin"; goal: Goal; gapMin: number };

export type TickInput = {
  user: User;
  now: Date;
  day: GoalDay | null; // goal_day for the user's local date
  goals: Goal[]; // goals of that day
  unansweredInARow: number; // trailing unanswered check-ins for the active goal
  /** Yesterday, only needed when a 24:00 window summarizes after midnight. */
  previous?: { day: GoalDay | null; goals: Goal[] };
};

export function activeGoal(goals: Goal[]): Goal | undefined {
  return [...goals]
    .sort((a, b) => a.priority - b.priority)
    .find((g) => g.completed_at === null);
}

export function inWindow(user: User, local: LocalTime): boolean {
  const minutes = minutesOfDay(local);
  return (
    minutes >= user.checkin_start_hour * 60 && minutes < user.checkin_end_hour * 60
  );
}

/** When the goal editor switches from today to tomorrow. */
export function planningCutoffMin(user: User): number {
  // A window ending at midnight has no post-window gap, so the nightly prompt
  // (which already refers to tomorrow) is the cutoff instead.
  return (user.checkin_end_hour === 24 ? user.nightly_hour : user.checkin_end_hour) * 60;
}

/**
 * Which local date the goal editor should target: today while the planning
 * cutoff has not passed, tomorrow afterwards.
 */
export function planningDate(user: User, now: Date): string {
  const local = localTime(now, user.timezone);
  return minutesOfDay(local) < planningCutoffMin(user)
    ? local.date
    : addDays(local.date, 1);
}

export function isCheckinDue(user: User, now: Date): boolean {
  return user.next_checkin_at === null || new Date(user.next_checkin_at) <= now;
}

/**
 * The summary for the window that just ended, or null. With a 24:00 end hour the
 * window ends at midnight, so the summary target is yesterday, checked between
 * midnight and the next start hour.
 */
function summaryAction({
  user,
  now,
  day,
  goals,
  previous,
}: TickInput): TickAction | null {
  const local = localTime(now, user.timezone);
  const minutes = minutesOfDay(local);
  let targetDay = day;
  let targetGoals = goals;
  let targetDate = local.date;

  if (user.checkin_end_hour === 24) {
    if (minutes >= user.checkin_start_hour * 60) return null;
    targetDay = previous?.day ?? null;
    targetGoals = previous?.goals ?? [];
    targetDate = addDays(local.date, -1);
  } else if (minutes < user.checkin_end_hour * 60) {
    return null;
  }

  if (!targetDay || targetGoals.length === 0 || targetDay.summary_sent_at !== null) {
    return null;
  }

  return {
    kind: "summary",
    dayId: targetDay.id,
    done: targetGoals.filter((g) => g.completed_at !== null).length,
    total: targetGoals.length,
    localDate: targetDate,
  };
}

/**
 * Decide what a tick should do for one user. Each returned action still has to be
 * claimed atomically in the database before its push is sent. At most one action
 * is returned per tick: two notifications arriving together read as noise.
 */
export function planTick(input: TickInput): TickAction[] {
  const { user, now, day, goals, unansweredInARow } = input;
  const local = localTime(now, user.timezone);

  if (local.hour >= user.nightly_hour && user.last_nightly_date !== local.date) {
    return [{ kind: "nightly", localDate: local.date }];
  }

  const summary = summaryAction(input);
  if (summary) return [summary];

  const minutes = minutesOfDay(local);
  if (user.checkin_end_hour < 24 && minutes >= user.checkin_end_hour * 60) return [];
  if (!inWindow(user, local)) return [];
  if (user.focus_until && new Date(user.focus_until) > now) return [];

  if (goals.length === 0) {
    const last = day?.nudge_sent_at ? new Date(day.nudge_sent_at) : null;
    if (!last || now.getTime() - last.getTime() >= NUDGE_EVERY_MIN * 60_000) {
      return [{ kind: "nudge", localDate: local.date }];
    }
    return [];
  }

  const goal = activeGoal(goals);
  if (!goal) {
    if (day && day.congrats_sent_at === null) {
      return [{ kind: "congrats", dayId: day.id }];
    }
    return [];
  }

  if (!isCheckinDue(user, now)) return [];

  const gapMin =
    unansweredInARow >= SLOWDOWN_AFTER
      ? Math.max(SLOW_GAP_MIN, user.checkin_interval_min)
      : user.checkin_interval_min;
  return [{ kind: "checkin", goal, gapMin }];
}
