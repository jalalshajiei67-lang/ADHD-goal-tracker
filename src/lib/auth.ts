import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getOrCreateUser } from "./data";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import type { User } from "./types";

export async function isSignedIn(): Promise<boolean> {
  // Everything behind auth depends on the current time (session expiry, check-in window),
  // so it must render per request, never in a prerender.
  await connection();
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** For pages and server actions: the user, or a redirect to /login. */
export async function requireUser(): Promise<User> {
  if (!(await isSignedIn())) redirect("/login");
  return getOrCreateUser();
}

/** For route handlers: the user, or null (caller returns 401). */
export async function userOrNull(): Promise<User | null> {
  return (await isSignedIn()) ? getOrCreateUser() : null;
}
