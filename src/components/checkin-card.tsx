"use client";

import { useEffect, useState, useTransition } from "react";
import { respond, saveNextStep, setFocus, setNotYetReason } from "@/app/actions";
import { formatElapsed } from "@/lib/time";
import {
  NOT_YET_REASONS,
  type CheckinResponse,
  type NotYetReason,
} from "@/lib/types";
import { Alarm } from "./alarm";
import { btn, card } from "./ui";

type Props = {
  goal: { id: string; title: string; nextStep: string | null };
  doneToday: number;
  lastAskedAt: string | null;
  notYetCount: number;
  ring?: boolean;
};

const REASON_LABEL: Record<NotYetReason, string> = {
  blocked: "Blocked",
  too_big: "Too big",
  not_now: "Not now",
  forgot: "Forgot",
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
export function CheckinCard({ goal, doneToday, lastAskedAt, notYetCount, ring = false }: Props) {
  const now = useNow(30_000);
  const [pending, startTransition] = useTransition();
  const [celebrated, setCelebrated] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ringing, setRinging] = useState(ring);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [stepOpen, setStepOpen] = useState(false);
  const [stepDraft, setStepDraft] = useState(goal.nextStep ?? "");
  const [stepMessage, setStepMessage] = useState<string | null>(null);

  function answer(response: CheckinResponse) {
    setRinging(false);
    startTransition(async () => {
      const result = await respond(goal.id, response);
      if (!result.ok) {
        setNote("That goal changed. Reloading.");
        return;
      }
      if (response === "done") {
        setCelebrated(goal.title);
        navigator.vibrate?.([60, 40, 120]);
        setNote(null);
      } else if (response === "not_yet") {
        setReasonFor(result.checkinId);
        setNote(null);
      } else if (response === "snooze") {
        setNote("Okay. I'll ask again in an hour.");
      }
    });
  }

  function chooseReason(reason: NotYetReason) {
    if (!reasonFor) return;
    startTransition(async () => {
      const ok = await setNotYetReason(reasonFor, reason);
      setReasonFor(null);
      if (!ok) {
        setNote("That answer moved on. No problem.");
        return;
      }
      setNote("Thanks. That helps me ask better.");
      if (reason === "too_big") setStepOpen(true);
    });
  }

  function saveStep(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const error = await saveNextStep(goal.id, stepDraft);
      if (error) {
        setStepMessage(error);
        return;
      }
      setStepOpen(false);
      setStepMessage(stepDraft.trim() ? "Saved. One small step." : null);
    });
  }

  function startFocus() {
    startTransition(async () => {
      const error = await setFocus(25);
      if (error) setNote(error);
    });
  }

  const showStepForm = stepOpen || (notYetCount >= 2 && !goal.nextStep);

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

      <Alarm ringing={ringing} onSilence={() => setRinging(false)} />

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

        {goal.nextStep && (
          <div className="flex flex-col gap-2 rounded-2xl bg-accent-soft px-4 py-3">
            <p className="text-sm font-medium uppercase tracking-wide text-muted">First step</p>
            <p className="text-lg break-words">{goal.nextStep}</p>
            <button
              type="button"
              className={btn.quiet}
              onClick={() => {
                setStepDraft(goal.nextStep ?? "");
                setStepOpen(true);
              }}
            >
              Change the first step
            </button>
          </div>
        )}

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

        {reasonFor && (
          <div role="group" aria-label="What got in the way?" className="flex flex-col gap-3">
            <p className="font-medium">What got in the way?</p>
            <div className="grid grid-cols-2 gap-2">
              {NOT_YET_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  disabled={pending}
                  onClick={() => chooseReason(reason)}
                  className="min-h-12 rounded-xl border-2 border-line bg-surface px-3 font-medium"
                >
                  {REASON_LABEL[reason]}
                </button>
              ))}
            </div>
            <button type="button" className={btn.quiet} onClick={() => setReasonFor(null)}>
              Skip
            </button>
          </div>
        )}

        {showStepForm && (
          <form onSubmit={saveStep} className="flex flex-col gap-3 rounded-2xl bg-gentle px-4 py-4">
            <label htmlFor="next-step" className="font-medium">
              Too big? Pick a 5-minute first step.
            </label>
            <input
              id="next-step"
              value={stepDraft}
              onChange={(e) => setStepDraft(e.target.value)}
              maxLength={160}
              placeholder="Open the document and write one sentence"
              className="min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className={btn.secondary}>
                Save step
              </button>
              <button type="button" className={btn.quiet} onClick={() => setStepOpen(false)}>
                Not now
              </button>
            </div>
            {stepMessage && (
              <p role="status" className="text-muted">
                {stepMessage}
              </p>
            )}
          </form>
        )}

        <button className={btn.quiet} disabled={pending} onClick={startFocus}>
          Focus 25 min
        </button>

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
