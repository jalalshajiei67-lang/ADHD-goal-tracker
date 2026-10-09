import { beforeAll, describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
});

describe("session tokens", () => {
  it("accepts a fresh token", async () => {
    expect(await verifySessionToken(await createSessionToken())).toBe(true);
  });

  it("rejects a tampered or expired token", async () => {
    const token = await createSessionToken();
    const [v, exp, sig] = token.split(".");
    expect(await verifySessionToken(`${v}.${Number(exp) + 1}.${sig}`)).toBe(false);
    expect(await verifySessionToken(await createSessionToken(0))).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
  });
});
