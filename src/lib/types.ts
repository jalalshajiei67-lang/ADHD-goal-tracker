export type User = {
  id: string;
  push_subscription: PushSubscriptionJSON | null;
  timezone: string;
  nightly_hour: number;
  checkin_start_hour: number;
  checkin_end_hour: number;
  checkin_interval_min: number;
  next_checkin_at: string | null;
  last_nightly_date: string | null;
  focus_until: string | null;
  last_tick_at: string | null;
  last_push_at: string | null;
  created_at: string;
};

export type GoalDay = {
  id: string;
  user_id: string;
  goal_date: string;
  nudge_sent_at: string | null;
  congrats_sent_at: string | null;
  summary_sent_at: string | null;
};

export type Goal = {
  id: string;
  goal_day_id: string;
  priority: number;
  title: string;
  next_step: string | null;
  completed_at: string | null;
  carried_from: string | null;
};

export type CheckinResponse = "done" | "not_yet" | "snooze";

export const NOT_YET_REASONS = ["blocked", "too_big", "not_now", "forgot"] as const;

export type NotYetReason = (typeof NOT_YET_REASONS)[number];

export type GoalTemplate = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
};
