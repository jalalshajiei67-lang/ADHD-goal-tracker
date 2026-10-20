import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { acknowledge } from "./checkin";
import {
  appendGoal,
  carryGoal,
  deleteTemplate,
  getDayWithGoals,
  listTemplates,
  saveGoals,
  saveTemplate,
} from "./data";
import { clearLoginFailures, loginAllowed, recordLoginFailure } from "./rate-limit";
import type { User } from "./types";

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

describe.skipIf(!url || !key)("database integration", () => {
  let admin: SupabaseClient;
  let user: User;

  beforeAll(async () => {
    process.env.SUPABASE_URL = url!;
    process.env.SUPABASE_SERVICE_ROLE_KEY = key!;
    admin = createClient(url!, key!, { auth: { persistSession: false } });
    const { data, error } = await admin.from("users").insert({}).select("*").single();
    if (error) throw error;
    user = data as User;
  });

  afterAll(async () => {
    if (admin && user) await admin.from("users").delete().eq("id", user.id);
  });

  beforeEach(async () => {
    await admin.from("checkins").delete().eq("user_id", user.id);
    await admin.from("goal_days").delete().eq("user_id", user.id);
    await admin.from("goal_templates").delete().eq("user_id", user.id);
    await admin
      .from("users")
      .update({ next_checkin_at: null, last_nightly_date: null, focus_until: null })
      .eq("id", user.id);
  });

  async function makeDay(date: string, titles: string[]) {
    await saveGoals(
      user.id,
      date,
      titles.map((title) => ({ id: null, title })),
    );
    const { day, goals } = await getDayWithGoals(user.id, date);
    if (!day) throw new Error("day was not created");
    return { day, goals };
  }

  it("save_goals reorders, deletes, renames and preserves completed goals", async () => {
    const { goals } = await makeDay("2026-10-09", ["A", "B", "C"]);
    const [a, b, c] = goals;

    await saveGoals(user.id, "2026-10-09", [
      { id: b.id, title: "B2" },
      { id: a.id, title: "A" },
    ]);
    const day = await getDayWithGoals(user.id, "2026-10-09");
    expect(day.goals.map((g) => [g.title, g.priority])).toEqual([
      ["B2", 1],
      ["A", 2],
    ]);
    expect(day.goals.some((g) => g.id === c.id)).toBe(false);

    const { goals: done } = await makeDay("2026-10-10", ["Done", "Open"]);
    await admin
      .from("goals")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", done[0].id);
    await saveGoals(user.id, "2026-10-10", [{ id: done[1].id, title: "Open" }]);
    const after = await getDayWithGoals(user.id, "2026-10-10");
    expect(after.goals.map((g) => g.title)).toEqual(["Open", "Done"]);
    expect(after.goals.find((g) => g.title === "Done")?.completed_at).not.toBeNull();
  });

  it("save_goals refuses more than five goals", async () => {
    await expect(
      saveGoals(
        user.id,
        "2026-10-11",
        Array.from({ length: 6 }, (_, i) => ({ id: null, title: `G${i}` })),
      ),
    ).rejects.toThrow(/max 5/);
  });

  it("carry_goal handles added, exists, full and not_found", async () => {
    const { goals } = await makeDay("2026-10-12", ["Carry me"]);
    const source = goals[0];

    expect(await carryGoal(user.id, source.id, "2026-10-13")).toBe("added");
    expect(await carryGoal(user.id, source.id, "2026-10-13")).toBe("exists");

    await makeDay("2026-10-14", ["1", "2", "3", "4", "5"]);
    expect(await carryGoal(user.id, source.id, "2026-10-14")).toBe("full");
    expect(
      await carryGoal(user.id, "00000000-0000-4000-8000-000000000000", "2026-10-13"),
    ).toBe("not_found");
  });

  it("acknowledge records a reason and is idempotent for done", async () => {
    const { goals } = await makeDay("2026-10-15", ["Write it"]);
    const goal = goals[0];
    const { data: checkin, error } = await admin
      .from("checkins")
      .insert({ user_id: user.id, goal_id: goal.id })
      .select("*")
      .single();
    if (error) throw error;

    const notYet = await acknowledge(user, goal.id, "not_yet", { reason: "too_big" });
    expect(notYet.ok).toBe(true);
    if (notYet.ok) expect(notYet.checkinId).toBe(checkin.id);

    const { data: row } = await admin
      .from("checkins")
      .select("response, reason")
      .eq("id", checkin.id)
      .single();
    expect(row).toMatchObject({ response: "not_yet", reason: "too_big" });

    const first = await acknowledge(user, goal.id, "done");
    const second = await acknowledge(user, goal.id, "done");
    expect(first.ok && first.completedNow).toBe(true);
    expect(second.ok && second.completedNow).toBe(false);
  });

  it("lets exactly one concurrent claim win", async () => {
    const now = new Date().toISOString();
    const next = new Date(Date.now() + 30 * 60_000).toISOString();
    const claim = () =>
      admin
        .from("users")
        .update({ next_checkin_at: next })
        .eq("id", user.id)
        .or(`next_checkin_at.is.null,next_checkin_at.lte.${now}`)
        .select("id");

    const [a, b] = await Promise.all([claim(), claim()]);
    expect((a.data?.length ?? 0) + (b.data?.length ?? 0)).toBe(1);
  });

  it("limits login failures per IP and clears on success", async () => {
    const ip = `test-${crypto.randomUUID()}`;
    for (let i = 0; i < 5; i++) await recordLoginFailure(ip);
    const blocked = await loginAllowed(ip);
    expect(blocked.allowed).toBe(false);

    await clearLoginFailures(ip);
    expect((await loginAllowed(ip)).allowed).toBe(true);
    await admin.from("login_attempts").delete().eq("ip", ip);
  });

  it("appends a shared goal and refuses when the day is full", async () => {
    expect(await appendGoal(user.id, "2026-10-16", "Read the thing")).toBe("added");
    const { goals } = await getDayWithGoals(user.id, "2026-10-16");
    expect(goals.map((g) => g.title)).toEqual(["Read the thing"]);

    await makeDay("2026-10-17", ["1", "2", "3", "4", "5"]);
    expect(await appendGoal(user.id, "2026-10-17", "Sixth")).toBe("full");
  });

  it("dedupes repeats case-insensitively", async () => {
    await saveTemplate(user.id, "Gym");
    await saveTemplate(user.id, "gym");
    const templates = await listTemplates(user.id);
    expect(templates).toHaveLength(1);
    await deleteTemplate(user.id, templates[0].id);
    expect(await listTemplates(user.id)).toHaveLength(0);
  });
});
