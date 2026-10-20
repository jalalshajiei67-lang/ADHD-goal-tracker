import { describe, expect, it } from "vitest";
import {
  clientIp,
  gateFromAttempts,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MIN,
} from "./rate-limit";

const now = new Date("2026-10-09T10:00:00Z").getTime();
const ago = (min: number) => now - min * 60_000;

describe("gateFromAttempts", () => {
  it("allows under the limit", () => {
    expect(gateFromAttempts([], now)).toEqual({ allowed: true });
    expect(gateFromAttempts(Array.from({ length: LOGIN_MAX_ATTEMPTS - 1 }, () => ago(1)), now)).toEqual({
      allowed: true,
    });
  });

  it("blocks at the limit", () => {
    const times = Array.from({ length: LOGIN_MAX_ATTEMPTS }, () => ago(1));
    const gate = gateFromAttempts(times, now);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.retryAfterMin).toBe(LOGIN_WINDOW_MIN - 1);
  });

  it("ignores attempts outside the window", () => {
    const times = Array.from({ length: LOGIN_MAX_ATTEMPTS }, () => ago(LOGIN_WINDOW_MIN + 1));
    expect(gateFromAttempts(times, now)).toEqual({ allowed: true });
  });

  it("always reports at least one minute", () => {
    const times = Array.from({ length: LOGIN_MAX_ATTEMPTS }, () => now);
    const gate = gateFromAttempts(times, now);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.retryAfterMin).toBe(LOGIN_WINDOW_MIN);
  });
});

describe("clientIp", () => {
  it("takes the first forwarded hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip and then a placeholder", () => {
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
