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

/** Push services that are worth retrying. Anything else is a configuration error. */
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [250, 1000];

type Sender = (
  subscription: webpush.PushSubscription,
  payload: string,
  options: webpush.RequestOptions,
) => Promise<unknown>;

export type SendDeps = {
  sender?: Sender;
  wait?: (ms: number) => Promise<void>;
  markDelivered?: (userId: string) => Promise<void>;
  markGone?: (userId: string) => Promise<void>;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function statusOf(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

function isGone(err: unknown): boolean {
  const status = statusOf(err);
  return status === 404 || status === 410;
}

function isTransient(err: unknown): boolean {
  const status = statusOf(err);
  // No status means a network/DNS failure; those are worth retrying too.
  return status === undefined || TRANSIENT_STATUS.has(status);
}

async function markDelivered(userId: string) {
  must(
    await db()
      .from("users")
      .update({ last_push_at: new Date().toISOString() })
      .eq("id", userId),
  );
}

async function markGone(userId: string) {
  must(await db().from("users").update({ push_subscription: null }).eq("id", userId));
}

/**
 * Sends one push, retrying transient failures. Returns false when the subscription
 * is gone (404/410); the subscription is then cleared so the app can show
 * "Re-enable notifications". Configuration errors (400/401/403) are thrown at once.
 */
export async function sendPush(
  user: User,
  payload: PushPayload,
  deps: SendDeps = {},
): Promise<boolean> {
  if (!user.push_subscription) return false;

  const sender = deps.sender ?? webpush.sendNotification;
  const wait = deps.wait ?? sleep;
  const onDelivered = deps.markDelivered ?? markDelivered;
  const onGone = deps.markGone ?? markGone;
  if (!deps.sender) configure();

  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await sender(
        user.push_subscription as webpush.PushSubscription,
        JSON.stringify(payload),
        { TTL: 60 * 60, urgency: "high" },
      );
      try {
        await onDelivered(user.id);
      } catch (err) {
        // A missed heartbeat must not turn a delivered push into an error.
        console.error("push: could not record delivery", err);
      }
      return true;
    } catch (err) {
      lastError = err;
      if (isGone(err)) {
        try {
          await onGone(user.id);
        } catch (clearErr) {
          console.error("push: could not clear subscription", clearErr);
        }
        return false;
      }
      if (!isTransient(err) || attempt === RETRY_DELAYS_MS.length) break;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
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
    url: `/checkin/${goalId}?alarm=1`,
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
