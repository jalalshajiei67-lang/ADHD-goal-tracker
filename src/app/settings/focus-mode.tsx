"use client";

import { useTransition } from "react";
import { setFocus } from "@/app/actions";
import { card } from "@/components/ui";

export function FocusMode({ focusUntil }: { focusUntil: string | null }) {
  const [pending, startTransition] = useTransition();
  const option =
    "min-h-12 rounded-xl border-2 border-line font-medium disabled:opacity-60";

  return (
    <section className={`${card} flex flex-col gap-4`}>
      <h2 className="text-xl font-semibold">Focus mode</h2>
      <p className="text-muted" suppressHydrationWarning>
        {focusUntil
          ? `Quiet until ${new Date(focusUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
          : "Pause check-ins for a while."}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {focusUntil ? (
          <button
            className={`${option} col-span-3`}
            disabled={pending}
            onClick={() => startTransition(() => { void setFocus(0); })}
          >
            Resume check-ins
          </button>
        ) : (
          [1, 2, 4].map((h) => (
            <button
              key={h}
              className={option}
              disabled={pending}
              onClick={() => startTransition(() => { void setFocus(h * 60); })}
            >
              {h} h
            </button>
          ))
        )}
      </div>
    </section>
  );
}
