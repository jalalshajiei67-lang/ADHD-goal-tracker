import { describe, expect, it } from "vitest";
import { planningDate, planTick, type TickInput } from "./plan";
import type { Goal, GoalDay, User } from "./types";

const user = (over: Partial<User> = {}): User => ({
  id: "u1",
  push_subscription: { endpoint: "https://push.example/1" },
  timezone: "Europe/Berlin",
  nightly_hour: 21,
  checkin_start_hour: 8,
  checkin_end_hour: 20,
  checkin_interval_min: 30,
  next_checkin_at: null,
  last_nightly_date: null,
  focus_until: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const day = (over: Partial<GoalDay> = {}): GoalDay => ({
  id: "d1",
  user_id: "u1",
  goal_date: "2026-10-09",
  nudge_sent_at: null,
  congrats_sent_at: null,
  summary_sent_at: null,
  ...over,
});

const goal = (priority: number, done = false): Goal => ({
  id: `g${priority}`,
  goal_day_id: "d1",
  priority,
  title: `Goal ${priority}`,
  completed_at: done ? "2026-10-09T07:00:00Z" : null,
  carried_from: null,
});

// Europe/Berlin is UTC+2 on 2026-10-09 (CEST).
const berlin = (hhmm: string) => new Date(`2026-10-09T${hhmm}:00+02:00`);

const plan = (over: Partial<TickInput>) =>
  planTick({ user: user(), now: berlin("10:00"), day: day(), goals: [], unansweredInARow: 0, ...over });

describe("planTick", () => {
  it("AC-1: sends the nightly prompt once at 21:00 local", () => {
    expect(plan({ now: berlin("21:00") })).toContainEqual({ kind: "nightly", localDate: "2026-10-09" });
    const sentToday = user({ last_nightly_date: "2026-10-09" });
    expect(plan({ user: sentToday, now: berlin("21:05") }).some((a) => a.kind === "nightly")).toBe(false);
  });

  it("does not send the nightly prompt before the hour", () => {
    expect(plan({ now: berlin("20:55") }).some((a) => a.kind === "nightly")).toBe(false);
  });

  it("AC-3: first check-in at window start references goal #1", () => {
    const actions = plan({ now: berlin("08:00"), goals: [goal(1), goal(2), goal(3)] });
    expect(actions).toEqual([{ kind: "checkin", goal: goal(1), gapMin: 30 }]);
  });

  it("AC-4: after goal #1 is done, the check-in references goal #2", () => {
    const actions = plan({ goals: [goal(1, true), goal(2), goal(3)] });
    expect(actions).toEqual([{ kind: "checkin", goal: goal(2), gapMin: 30 }]);
  });

  it("AC-6: no check-in while next_checkin_at is in the future", () => {
    const u = user({ next_checkin_at: berlin("10:20").toISOString() });
    expect(plan({ user: u, goals: [goal(1)] })).toEqual([]);
  });

  it("sends the check-in once next_checkin_at has passed", () => {
    const u = user({ next_checkin_at: berlin("09:59").toISOString() });
    expect(plan({ user: u, goals: [goal(1)] })).toHaveLength(1);
  });

  it("AC-7: no check-in at or after the end hour", () => {
    expect(plan({ now: berlin("20:30"), goals: [goal(1)] }).some((a) => a.kind === "checkin")).toBe(false);
  });

  it("no check-in before the start hour", () => {
    expect(plan({ now: berlin("07:55"), goals: [goal(1)] })).toEqual([]);
  });

  it("widens the gap after 3 unanswered check-ins", () => {
    const [a] = plan({ goals: [goal(1)], unansweredInARow: 3 });
    expect(a).toEqual({ kind: "checkin", goal: goal(1), gapMin: 60 });
  });

  it("EC-1: nudges when no goals are set, at most hourly", () => {
    expect(plan({ day: null })).toEqual([{ kind: "nudge", localDate: "2026-10-09" }]);
    const recent = day({ nudge_sent_at: berlin("09:30").toISOString() });
    expect(plan({ day: recent })).toEqual([]);
    const old = day({ nudge_sent_at: berlin("09:00").toISOString() });
    expect(plan({ day: old })).toHaveLength(1);
  });

  it("EC-2: congratulates once when all goals are done", () => {
    const goals = [goal(1, true), goal(2, true)];
    expect(plan({ goals })).toEqual([{ kind: "congrats", dayId: "d1" }]);
    expect(plan({ goals, day: day({ congrats_sent_at: berlin("09:00").toISOString() }) })).toEqual([]);
  });

  it("AC-8: sends the day summary after the window ends", () => {
    const goals = [goal(1, true), goal(2, true), goal(3)];
    expect(plan({ now: berlin("20:00"), goals })).toEqual([
      { kind: "summary", dayId: "d1", done: 2, total: 3 },
    ]);
    const sent = day({ summary_sent_at: berlin("20:00").toISOString() });
    expect(plan({ now: berlin("20:05"), goals, day: sent })).toEqual([]);
  });

  it("no summary on a day without goals", () => {
    expect(plan({ now: berlin("20:00"), goals: [] })).toEqual([]);
  });

  it("focus mode suppresses check-ins", () => {
    const u = user({ focus_until: berlin("11:00").toISOString() });
    expect(plan({ user: u, goals: [goal(1)] })).toEqual([]);
  });

  it("uses the user's timezone, not UTC", () => {
    // 07:30 UTC is 09:30 in Berlin: inside the window.
    const now = new Date("2026-10-09T07:30:00Z");
    expect(plan({ now, goals: [goal(1)] })).toHaveLength(1);
    // Same instant is 03:30 in New York: outside the window.
    const ny = user({ timezone: "America/New_York" });
    expect(plan({ user: ny, now, goals: [goal(1)] })).toEqual([]);
  });
});

describe("planningDate", () => {
  it("targets today during the day and tomorrow after the window", () => {
    expect(planningDate(user(), berlin("19:59"))).toBe("2026-10-09");
    expect(planningDate(user(), berlin("21:00"))).toBe("2026-10-10");
  });
});
