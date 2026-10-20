"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respond, setFocus } from "@/app/actions";
import { btn, card } from "./ui";

/** Shown instead of the check-in card while focus mode is on. */
export function FocusCard({
  goal,
  until,
}: {
  goal: { id: string; title: string };
  until: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [pending, startTransition] = useTransition();
  const refreshed = useRef(false);
  const left = now ? Math.max(0, new Date(until).getTime() - now.getTime()) : null;

  useEffect(() => {
    const update = () => setNow(new Date());
    // Defer the first tick so server and client render the same placeholder.
    const first = setTimeout(update, 0);
    const timer = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (left === 0 && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [left, router]);

  const minutes = left === null ? null : Math.floor(left / 60_000);
  const seconds = left === null ? null : Math.floor((left % 60_000) / 1000);
  const timeLeft =
    minutes === null || seconds === null
      ? "Focusing…"
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  function done() {
    startTransition(async () => {
      await respond(goal.id, "done");
    });
  }

  function stop() {
    startTransition(async () => {
      await setFocus(0);
    });
  }

  return (
    <section className={`${card} flex flex-col items-center gap-5 text-center`}>
      <p className="text-sm font-medium uppercase tracking-wide text-muted">Focus mode</p>
      <h1 className="text-2xl font-bold break-words">{goal.title}</h1>
      <p
        className="text-6xl font-bold tabular-nums text-accent"
        aria-live="off"
        suppressHydrationWarning
      >
        {timeLeft}
      </p>
      <p className="text-muted">Check-ins are paused. One thing at a time.</p>
      <div className="flex w-full flex-col gap-3">
        <button className={btn.primary} disabled={pending} onClick={done}>
          I finished this
        </button>
        <button className={btn.quiet} disabled={pending} onClick={stop}>
          End focus
        </button>
      </div>
    </section>
  );
}
