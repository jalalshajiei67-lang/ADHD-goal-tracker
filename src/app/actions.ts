"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { acknowledge } from "@/lib/checkin";
import { carryGoal, saveGoals, updateUser, type CarryResult } from "@/lib/data";
import { planningDate } from "@/lib/plan";
import { sendPush } from "@/lib/push";
import { createSessionToken, passphraseMatches, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
import { addDays, isValidTimeZone } from "@/lib/time";
import type { CheckinResponse } from "@/lib/types";

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const passphrase = String(formData.get("passphrase") ?? "");
  if (!passphraseMatches(passphrase)) return "That passphrase didn't match. Try again.";

  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export type GoalDraft = { id: string | null; title: string };

export async function saveGoalList(date: string, goals: GoalDraft[]): Promise<string | null> {
  const user = await requireUser();
  const today = planningDate(user, new Date());
  // Only today/tomorrow-ish dates are editable from the app.
  if (date !== today && date !== addDays(today, 1) && date !== addDays(today, -1)) {
    return "That day can't be edited.";
  }
  const clean = goals
    .map((g) => ({ id: g.id, title: g.title.trim().slice(0, 120) }))
    .filter((g) => g.title.length > 0);
  if (clean.length > 5) return "Five goals is the limit.";
  await saveGoals(user.id, date, clean);
  refresh();
  return null;
}

export async function respond(goalId: string, response: CheckinResponse) {
  const user = await requireUser();
  const result = await acknowledge(user, goalId, response);
  refresh();
  return result;
}

export async function carryToTomorrow(goalId: string, fromDate: string): Promise<CarryResult> {
  const user = await requireUser();
  return carryGoal(user.id, goalId, addDays(fromDate, 1));
}

export type SettingsInput = {
  timezone: string;
  nightly_hour: number;
  checkin_start_hour: number;
  checkin_end_hour: number;
  checkin_interval_min: number;
};

export async function saveSettings(input: SettingsInput): Promise<string | null> {
  const user = await requireUser();
  const hour = (n: number, min: number, max: number) =>
    Number.isInteger(n) && n >= min && n <= max;
  if (!isValidTimeZone(input.timezone)) return "Unknown timezone.";
  if (!hour(input.nightly_hour, 0, 23)) return "Pick a nightly hour.";
  if (!hour(input.checkin_start_hour, 0, 23) || !hour(input.checkin_end_hour, 1, 24)) {
    return "Pick start and end hours.";
  }
  if (input.checkin_start_hour >= input.checkin_end_hour) return "Start must be before end.";
  if (![15, 30, 60].includes(input.checkin_interval_min)) return "Pick an interval.";

  // A shorter interval applies right away: pull an already-scheduled check-in closer.
  const soonest = new Date(Date.now() + input.checkin_interval_min * 60_000);
  const next = user.next_checkin_at ? new Date(user.next_checkin_at) : null;
  const next_checkin_at = next && next > soonest ? soonest.toISOString() : user.next_checkin_at;

  await updateUser(user.id, { ...input, next_checkin_at });
  refresh();
  return null;
}

export async function setFocus(hours: number) {
  const user = await requireUser();
  const until = hours > 0 ? new Date(Date.now() + hours * 3_600_000).toISOString() : null;
  await updateUser(user.id, { focus_until: until });
  refresh();
}

export async function sendTestPush(): Promise<boolean> {
  const user = await requireUser();
  return sendPush(user, {
    title: "PriorityPulse",
    body: "Test check-in. You're all set.",
    url: "/",
    tag: "test",
  });
}
