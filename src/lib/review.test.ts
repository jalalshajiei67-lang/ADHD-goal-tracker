import { describe, expect, it } from "vitest";
import { summarizeReview, type ReviewDayInput } from "./review";

const day = (date: string, goals: ReviewDayInput["goals"]): ReviewDayInput => ({ date, goals });
const done = (title: string) => ({
  title,
  completed_at: "2026-10-09T10:00:00Z",
  carried_from: null,
});
const open = (title: string, carried: string | null = null) => ({
  title,
  completed_at: null,
  carried_from: carried,
});

describe("summarizeReview", () => {
  it("counts done and total per day", () => {
    const review = summarizeReview([
      day("2026-10-08", [done("Gym"), open("Report")]),
      day("2026-10-09", [done("Gym"), done("Report")]),
    ]);
    expect(review.days).toEqual([
      { date: "2026-10-08", total: 2, done: 1 },
      { date: "2026-10-09", total: 2, done: 2 },
    ]);
    expect(review.total).toBe(4);
    expect(review.done).toBe(3);
  });

  it("groups rollovers by title, case-insensitively", () => {
    const review = summarizeReview([
      day("2026-10-09", [
        open("Report", "g1"),
        open("report", "g2"),
        open("Gym", "g3"),
        open("Plain"),
      ]),
    ]);
    expect(review.rolled).toEqual([
      { title: "Report", count: 2 },
      { title: "Gym", count: 1 },
    ]);
  });

  it("counts not-yet reasons", () => {
    const review = summarizeReview([], ["blocked", "blocked", "too_big"]);
    expect(review.reasons).toEqual({ blocked: 2, too_big: 1, not_now: 0, forgot: 0 });
  });

  it("handles an empty range", () => {
    expect(summarizeReview([])).toEqual({
      days: [],
      total: 0,
      done: 0,
      rolled: [],
      reasons: { blocked: 0, too_big: 0, not_now: 0, forgot: 0 },
    });
  });
});
