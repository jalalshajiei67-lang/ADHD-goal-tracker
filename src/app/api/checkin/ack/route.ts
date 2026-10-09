import { userOrNull } from "@/lib/auth";
import { acknowledge } from "@/lib/checkin";
import type { CheckinResponse } from "@/lib/types";

const RESPONSES: CheckinResponse[] = ["done", "not_yet", "snooze"];

// Used by the service worker when a notification action button is tapped.
export async function POST(request: Request) {
  const user = await userOrNull();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    goalId?: string;
    response?: CheckinResponse;
    source?: "notification" | "app";
  } | null;
  if (!body?.goalId || !body.response || !RESPONSES.includes(body.response)) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const result = await acknowledge(user, body.goalId, body.response, {
    notify: body.source === "notification",
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
  return Response.json(result);
}
