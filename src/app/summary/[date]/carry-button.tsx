"use client";

import { useState, useTransition } from "react";
import { carryToTomorrow } from "@/app/actions";
import type { CarryResult } from "@/lib/data";

const LABELS: Record<CarryResult, string> = {
  added: "Added ✓",
  exists: "Already there ✓",
  full: "Tomorrow is full",
  not_found: "Not available",
};

export function CarryButton({ goalId, date }: { goalId: string; date: string }) {
  const [result, setResult] = useState<CarryResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result) {
    return (
      <span role="status" className="shrink-0 text-muted">
        {LABELS[result]}
      </span>
    );
  }
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(async () => setResult(await carryToTomorrow(goalId, date)))}
      className="min-h-12 shrink-0 rounded-xl border-2 border-line px-3 font-medium"
    >
      Carry over
    </button>
  );
}
