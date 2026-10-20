import { describe, expect, it, vi } from "vitest";
import { messages, sendPush, type SendDeps } from "./push";
import type { User } from "./types";

const user = (over: Partial<User> = {}): User => ({
  id: "u1",
  push_subscription: {
    endpoint: "https://push.example/1",
    keys: { p256dh: "p256dh", auth: "auth" },
  },
  timezone: "Europe/Berlin",
  nightly_hour: 21,
  checkin_start_hour: 8,
  checkin_end_hour: 20,
  checkin_interval_min: 30,
  next_checkin_at: null,
  last_nightly_date: null,
  focus_until: null,
  last_tick_at: null,
  last_push_at: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const httpError = (status: number) =>
  Object.assign(new Error(`push failed: ${status}`), { statusCode: status });

const deps = (over: Partial<SendDeps> = {}): SendDeps => ({
  sender: vi.fn().mockResolvedValue({}),
  wait: vi.fn().mockResolvedValue(undefined),
  markDelivered: vi.fn().mockResolvedValue(undefined),
  markGone: vi.fn().mockResolvedValue(undefined),
  ...over,
});

const payload = messages.checkin("g1", "Write the report");

describe("sendPush", () => {
  it("delivers and records the heartbeat", async () => {
    const d = deps();
    await expect(sendPush(user(), payload, d)).resolves.toBe(true);
    expect(d.sender).toHaveBeenCalledTimes(1);
    expect(d.markDelivered).toHaveBeenCalledWith("u1");
    expect(d.markGone).not.toHaveBeenCalled();
  });

  it("retries a 503 and then succeeds", async () => {
    const sender = vi
      .fn()
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce({});
    const d = deps({ sender });
    await expect(sendPush(user(), payload, d)).resolves.toBe(true);
    expect(sender).toHaveBeenCalledTimes(2);
    expect(d.wait).toHaveBeenCalledWith(250);
  });

  it("retries a network error with no status code", async () => {
    const sender = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({});
    const d = deps({ sender });
    await expect(sendPush(user(), payload, d)).resolves.toBe(true);
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it("clears a gone subscription and does not retry", async () => {
    const sender = vi.fn().mockRejectedValue(httpError(410));
    const d = deps({ sender });
    await expect(sendPush(user(), payload, d)).resolves.toBe(false);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(d.markGone).toHaveBeenCalledWith("u1");
    expect(d.markDelivered).not.toHaveBeenCalled();
  });

  it("does not retry a configuration error", async () => {
    const sender = vi.fn().mockRejectedValue(httpError(400));
    const d = deps({ sender });
    await expect(sendPush(user(), payload, d)).rejects.toMatchObject({ statusCode: 400 });
    expect(sender).toHaveBeenCalledTimes(1);
    expect(d.wait).not.toHaveBeenCalled();
  });

  it("gives up after three attempts", async () => {
    const sender = vi.fn().mockRejectedValue(httpError(503));
    const d = deps({ sender });
    await expect(sendPush(user(), payload, d)).rejects.toMatchObject({ statusCode: 503 });
    expect(sender).toHaveBeenCalledTimes(3);
    expect(d.wait).toHaveBeenNthCalledWith(1, 250);
    expect(d.wait).toHaveBeenNthCalledWith(2, 1000);
    expect(d.markDelivered).not.toHaveBeenCalled();
  });

  it("does nothing without a subscription", async () => {
    const d = deps();
    await expect(sendPush(user({ push_subscription: null }), payload, d)).resolves.toBe(false);
    expect(d.sender).not.toHaveBeenCalled();
  });

  it("still succeeds when the heartbeat write fails", async () => {
    const d = deps({ markDelivered: vi.fn().mockRejectedValue(new Error("db down")) });
    await expect(sendPush(user(), payload, d)).resolves.toBe(true);
  });
});
