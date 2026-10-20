import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { userOrNull } from "@/lib/auth";
import { appendGoal } from "@/lib/data";
import { planningDate } from "@/lib/plan";
import { sharedTitle } from "@/lib/share";
import type { User } from "@/lib/types";

const SHARE_COOKIE = "pp_share";
const SHARE_COOKIE_MAX_AGE = 10 * 60;

/** Adds the shared text as the last goal of the planning day. */
async function addShared(user: User, title: string): Promise<"added" | "full"> {
  return appendGoal(user.id, planningDate(user, new Date()), title);
}

function goalsRedirect(request: Request, result?: "added" | "full") {
  const path = result === "full" ? "/goals?full=1" : "/goals";
  return NextResponse.redirect(new URL(path, request.url), 303);
}

function loginRedirect(request: Request, title: string) {
  const res = NextResponse.redirect(new URL("/login?next=/share", request.url), 303);
  res.cookies.set(SHARE_COOKIE, title, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SHARE_COOKIE_MAX_AGE,
  });
  return res;
}

/** Android share target: the installed PWA receives title/text/url as form data. */
export async function POST(request: Request) {
  const form = await request.formData();
  const title = sharedTitle({
    title: String(form.get("title") ?? ""),
    text: String(form.get("text") ?? ""),
    url: String(form.get("url") ?? ""),
  });
  if (!title) return goalsRedirect(request);

  const user = await userOrNull();
  if (!user) return loginRedirect(request, title);

  return goalsRedirect(request, await addShared(user, title));
}

/** After login, consume the pending share and add it. */
export async function GET(request: Request) {
  const pending = (await cookies()).get(SHARE_COOKIE)?.value;
  if (!pending) return goalsRedirect(request);

  const user = await userOrNull();
  if (!user) return NextResponse.redirect(new URL("/login?next=/share", request.url), 303);

  const title = sharedTitle({ text: pending });
  if (!title) return goalsRedirect(request);

  const res = goalsRedirect(request, await addShared(user, title));
  res.cookies.set(SHARE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
