"use client";

import { useEffect, useState } from "react";
import { tickHealth } from "@/lib/health";
import { formatElapsed } from "@/lib/time";

/** Shows the last tick and last push so a dead cron is visible, not silent. */
export function Health({
  lastTickAt,
  lastPushAt,
}: {
  lastTickAt: string | null;
  lastPushAt: string | null;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    // Defer the first tick so the server-rendered placeholder and the client's
    // first render match.
    const first = setTimeout(update, 0);
    const timer = setInterval(update, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  if (!now) return <p className="text-muted">Checking the schedule…</p>;

  const status = tickHealth(lastTickAt, now.getTime());

  if (status === "stale") {
    return (
      <p className="rounded-xl bg-gentle px-4 py-3">
        No check-in run for {formatElapsed(new Date(lastTickAt!), now)}. The Supabase cron
        schedule may be paused. Check-ins are not being sent.
      </p>
    );
  }

  if (status === "never") {
    return (
      <p className="text-muted">
        No check-in run recorded yet. The first one happens within five minutes.
      </p>
    );
  }

  return (
    <p className="text-muted">
      Checked {formatElapsed(new Date(lastTickAt!), now)} ago.
      {lastPushAt
        ? ` Last notification ${formatElapsed(new Date(lastPushAt), now)} ago.`
        : " No notification sent yet."}
    </p>
  );
}
