"use client";

import { useEffect, useState, useTransition } from "react";
import { respond } from "@/app/actions";
import { formatElapsed } from "@/lib/time";
import type { CheckinResponse } from "@/lib/types";
import { btn, card } from "./ui";

type Props = {
  goal: { id: string; title: string };
  doneToday: number;
  lastAskedAt: string | null;
};

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** The single active goal with Done / Not yet. Future goals are deliberately not shown. */
export function CheckinCard({ goal, doneToday, lastAskedAt }: Props) {
  const now = useNow(30_000);
  const [pending, startTransition] = useTransition();
  const [celebrated, setCelebrated] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function answer(response: CheckinResponse) {
    startTransition(async () => {
      const result = await respond(goal.id, response);
      if (response === "done" && result.ok) {
        setCelebrated(goal.title);
        navigator.vibrate?.([60, 40, 120]);
        setNote(null);
      } else if (response === "not_yet") {
        setNote("No problem. I'll ask again later.");
      } else if (response === "snooze") {
        setNote("Okay. I'll ask again in an hour.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {celebrated && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3"
        >
          <span className="animate-pop text-2xl" aria-hidden>
            ✓
          </span>
          <span>
            Done: <strong>{celebrated}</strong>
          </span>
        </div>
      )}

      <section className={`${card} flex flex-col gap-6`} aria-labelledby="active-goal">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-wide text-muted">Right now</p>
          <h1 id="active-goal" className="text-3xl font-bold leading-tight break-words">
            {goal.title}
          </h1>
          {lastAskedAt && (
            <p className="text-muted">Last asked {formatElapsed(new Date(lastAskedAt), now)} ago</p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <button className={btn.primary} disabled={pending} onClick={() => answer("done")}>
            Done
          </button>
          <button className={btn.secondary} disabled={pending} onClick={() => answer("not_yet")}>
            Not yet
          </button>
          <button className={btn.quiet} disabled={pending} onClick={() => answer("snooze")}>
            Ask again in 1 hour
          </button>
        </div>
        {note && (
          <p role="status" className="text-muted">
            {note}
          </p>
        )}
      </section>

      {doneToday > 0 && (
        <p className="text-center text-muted">
          {doneToday} done today{doneToday > 1 ? ". Nice." : "."}
        </p>
      )}
    </div>
  );
}
