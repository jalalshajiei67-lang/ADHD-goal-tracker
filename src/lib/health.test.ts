import { describe, expect, it } from "vitest";
import { STALE_TICK_MS, tickHealth } from "./health";

const now = new Date("2026-10-09T10:00:00Z").getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("tickHealth", () => {
  it("reports a missing heartbeat", () => {
    expect(tickHealth(null, now)).toBe("never");
    expect(tickHealth("not a date", now)).toBe("never");
  });

  it("is ok within the threshold", () => {
    expect(tickHealth(ago(0), now)).toBe("ok");
    expect(tickHealth(ago(STALE_TICK_MS), now)).toBe("ok");
  });

  it("is stale after three missed ticks", () => {
    expect(tickHealth(ago(STALE_TICK_MS + 1), now)).toBe("stale");
  });
});
