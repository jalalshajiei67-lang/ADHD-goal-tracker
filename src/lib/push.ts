import "server-only";
import webpush from "web-push";
import { db, must } from "./db";
import type { User } from "./types";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  goalId?: string;
  actions?: { action: string; title: string }[];
  requireInteraction?: boolean;
};

let configured = false;

function configure() {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) throw new Error("VAPID env vars are not set");
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

/**
 * Sends one push. Returns false when the subscription is gone (404/410); the
 * subscription is then cleared so the app can show "Re-enable notifications".
 */
export async function sendPush(user: User, payload: PushPayload): Promise<boolean> {
  if (!user.push_subscription) return false;
  configure();
  try {
    await webpush.sendNotification(
      user.push_subscription as webpush.PushSubscription,
      JSON.stringify(payload),
      { TTL: 60 * 60, urgency: "high" },
    );
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      must(await db().from("users").update({ push_subscription: null }).eq("id", user.id));
      return false;
    }
    throw err;
  }
}

export const messages = {
  nightly: (): PushPayload => ({
    title: "PriorityPulse",
    body: "What are tomorrow's goals?",
    url: "/goals",
    tag: "nightly",
  }),
  nudge: (): PushPayload => ({
    title: "PriorityPulse",
    body: "What matters today? Add a goal or two.",
    url: "/goals",
    tag: "nudge",
  }),
  checkin: (goalId: string, title: string): PushPayload => ({
    title: "Did you finish?",
    body: title,
    url: `/checkin/${goalId}`,
    tag: "checkin",
    goalId,
    // One button only: with two, some Android phones reported a Done tap as "not_yet".
    // Tapping the notification itself opens the check-in screen for the other answers.
    actions: [{ action: "done", title: "Done" }],
    requireInteraction: true,
  }),
  next: (title: string): PushPayload => ({
    title: "Nice. That's done.",
    body: `Next up: ${title}`,
    url: "/",
    tag: "checkin",
  }),
  congrats: (): PushPayload => ({
    title: "All done for today",
    body: "Every goal finished. Enjoy the rest of your day.",
    url: "/",
    tag: "congrats",
  }),
  summary: (date: string, done: number, total: number): PushPayload => ({
    title: "Today",
    body: `${done} of ${total} goals done.`,
    url: `/summary/${date}`,
    tag: "summary",
  }),
};
