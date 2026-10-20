import "server-only";
import { db, must } from "./db";

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MIN = 15;
const CLEANUP_AFTER_MS = 24 * 60 * 60_000;

export type LoginGate =
  | { allowed: true }
  | { allowed: false; retryAfterMin: number };

/** Vercel sets x-forwarded-for; take the first hop. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Pure policy: how many failures in the window, and when does the oldest expire? */
export function gateFromAttempts(times: number[], now: number): LoginGate {
  const cutoff = now - LOGIN_WINDOW_MIN * 60_000;
  const recent = times.filter((t) => t > cutoff);
  if (recent.length < LOGIN_MAX_ATTEMPTS) return { allowed: true };
  const oldest = Math.min(...recent);
  const retryAfterMin = Math.max(
    1,
    Math.ceil((oldest + LOGIN_WINDOW_MIN * 60_000 - now) / 60_000),
  );
  return { allowed: false, retryAfterMin };
}

export async function loginAllowed(ip: string, now = new Date()): Promise<LoginGate> {
  must(
    await db()
      .from("login_attempts")
      .delete()
      .lt("attempted_at", new Date(now.getTime() - CLEANUP_AFTER_MS).toISOString()),
  );
  const cutoff = new Date(now.getTime() - LOGIN_WINDOW_MIN * 60_000).toISOString();
  const rows = must(
    await db()
      .from("login_attempts")
      .select("attempted_at")
      .eq("ip", ip)
      .gte("attempted_at", cutoff),
  ) as { attempted_at: string }[];
  return gateFromAttempts(
    rows.map((r) => new Date(r.attempted_at).getTime()),
    now.getTime(),
  );
}

export async function recordLoginFailure(ip: string, now = new Date()): Promise<void> {
  must(await db().from("login_attempts").insert({ ip, attempted_at: now.toISOString() }));
}

export async function clearLoginFailures(ip: string): Promise<void> {
  must(await db().from("login_attempts").delete().eq("ip", ip));
}
