import { userOrNull } from "@/lib/auth";
import { updateUser } from "@/lib/data";
import { isValidTimeZone } from "@/lib/time";
import type { User } from "@/lib/types";

export async function POST(request: Request) {
  const user = await userOrNull();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    subscription?: PushSubscriptionJSON;
    timezone?: string;
  } | null;
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return Response.json({ error: "invalid subscription" }, { status: 400 });
  }

  const fields: Partial<User> = { push_subscription: { endpoint: sub.endpoint, keys: sub.keys } };
  // First-run convenience: adopt the device timezone if none was chosen yet.
  if (user.timezone === "UTC" && body?.timezone && isValidTimeZone(body.timezone)) {
    fields.timezone = body.timezone;
  }
  await updateUser(user.id, fields);
  return Response.json({ ok: true });
}
