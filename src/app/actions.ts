"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { acknowledge, setNotYetReason as recordNotYetReason } from "@/lib/checkin";
import {
  carryGoal,
  deleteTemplate,
  getOwnedGoal,
  saveGoals,
  saveTemplate,
  setNextStep,
  updateUser,
  type CarryResult,
} from "@/lib/data";
import { planningDate } from "@/lib/plan";
import { sendPush } from "@/lib/push";
import { createSessionToken, passphraseMatches, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
import {
  clearLoginFailures,
  clientIp,
  loginAllowed,
  recordLoginFailure,
} from "@/lib/rate-limit";
import { addDays, isValidTimeZone } from "@/lib/time";
import { NOT_YET_REASONS, type CheckinResponse, type NotYetReason } from "@/lib/types";

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const ip = clientIp(await headers());
  const gate = await loginAllowed(ip);
  if (!gate.allowed) {
    return `Too many attempts. Try again in ${gate.retryAfterMin} min.`;
  }

  const passphrase = String(formData.get("passphrase") ?? "");
  if (!passphraseMatches(passphrase)) {
    await recordLoginFailure(ip);
    return "That passphrase didn't match. Try again.";
  }
  await clearLoginFailures(ip);

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
  // The page may have been open since before the planning day rolled over.
  if (date !== today) return "The day just changed. Reloading — please re-enter your goals.";
  const clean = goals
    .map((g) => ({ id: g.id, title: g.title.trim().slice(0, 120) }))
    .filter((g) => g.title.length > 0);
  if (clean.length > 5) return "Five goals is the limit.";
  await saveGoals(user.id, date, clean);
  refresh();
  return null;
}

export async function respond(
  goalId: string,
  response: CheckinResponse,
  reason?: NotYetReason,
) {
  const user = await requireUser();
  const cleanReason =
    response === "not_yet" && reason && NOT_YET_REASONS.includes(reason) ? reason : null;
  const result = await acknowledge(user, goalId, response, { reason: cleanReason });
  refresh();
  return result;
}

export async function setNotYetReason(
  checkinId: string,
  reason: NotYetReason,
): Promise<boolean> {
  const user = await requireUser();
  if (!NOT_YET_REASONS.includes(reason)) return false;
  const ok = await recordNotYetReason(user, checkinId, reason);
  refresh();
  return ok;
}

/** Stores a smaller first step, or clears it when the text is empty. */
export async function saveNextStep(goalId: string, text: string): Promise<string | null> {
  const user = await requireUser();
  const owned = await getOwnedGoal(user.id, goalId);
  if (!owned) return "That goal no longer exists.";
  const clean = text.trim().slice(0, 160);
  await setNextStep(goalId, clean.length > 0 ? clean : null);
  refresh();
  return null;
}

export async function carryToTomorrow(goalId: string, fromDate: string): Promise<CarryResult> {
  const user = await requireUser();
  return carryGoal(user.id, goalId, addDays(fromDate, 1));
}

export async function addTemplate(title: string): Promise<string | null> {
  const user = await requireUser();
  const clean = title.trim().slice(0, 120);
  if (!clean) return "Type a goal first.";
  await saveTemplate(user.id, clean);
  refresh();
  return null;
}

export async function removeTemplate(id: string): Promise<void> {
  const user = await requireUser();
  await deleteTemplate(user.id, id);
  refresh();
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
  if (input.checkin_start_hour === 0 && input.checkin_end_hour === 24) {
    return "With check-ins ending at midnight, start at 01:00 or later.";
  }
  if (![15, 30, 60].includes(input.checkin_interval_min)) return "Pick an interval.";

  // A shorter interval applies right away: pull an already-scheduled check-in closer.
  const soonest = new Date(Date.now() + input.checkin_interval_min * 60_000);
  const next = user.next_checkin_at ? new Date(user.next_checkin_at) : null;
  const next_checkin_at = next && next > soonest ? soonest.toISOString() : user.next_checkin_at;

  await updateUser(user.id, { ...input, next_checkin_at });
  refresh();
  return null;
}

export async function setFocus(minutes: number): Promise<string | null> {
  const user = await requireUser();
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 480) {
    return "Pick a focus length between 0 and 8 hours.";
  }
  const until =
    minutes > 0 ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
  await updateUser(user.id, { focus_until: until });
  refresh();
  return null;
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
