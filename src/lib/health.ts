/** The tick runs every five minutes; three missed ticks means something is wrong. */
export const STALE_TICK_MS = 15 * 60_000;

export type TickHealth = "never" | "ok" | "stale";

export function tickHealth(lastTickAt: string | null, now = Date.now()): TickHealth {
  if (!lastTickAt) return "never";
  const then = new Date(lastTickAt).getTime();
  if (Number.isNaN(then)) return "never";
  return now - then > STALE_TICK_MS ? "stale" : "ok";
}
