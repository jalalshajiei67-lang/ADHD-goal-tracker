import { describe, expect, it } from "vitest";
import { addDays, formatElapsed, isValidTimeZone, localTime, minutesOfDay } from "./time";

describe("localTime", () => {
  it("returns the wall clock in the user's zone", () => {
    const berlin = localTime(new Date("2026-10-09T07:30:00Z"), "Europe/Berlin");
    expect(berlin).toEqual({ date: "2026-10-09", hour: 9, minute: 30 });
  });

  it("handles zones behind UTC and the date rollover", () => {
    expect(localTime(new Date("2026-10-09T02:00:00Z"), "America/New_York")).toEqual({
      date: "2026-10-08",
      hour: 22,
      minute: 0,
    });
  });

  it("handles a +14 zone", () => {
    expect(localTime(new Date("2026-10-09T10:00:00Z"), "Pacific/Kiritimati")).toEqual({
      date: "2026-10-10",
      hour: 0,
      minute: 0,
    });
  });

  it("crosses the spring-forward gap", () => {
    // 01:00 UTC is when Berlin jumps from 02:00 CET to 03:00 CEST.
    expect(localTime(new Date("2026-03-29T00:30:00Z"), "Europe/Berlin")).toEqual({
      date: "2026-03-29",
      hour: 1,
      minute: 30,
    });
    expect(localTime(new Date("2026-03-29T01:30:00Z"), "Europe/Berlin")).toEqual({
      date: "2026-03-29",
      hour: 3,
      minute: 30,
    });
  });

  it("sees both 02:30s on the fall-back day", () => {
    expect(localTime(new Date("2026-10-25T00:30:00Z"), "Europe/Berlin")).toEqual({
      date: "2026-10-25",
      hour: 2,
      minute: 30,
    });
    expect(localTime(new Date("2026-10-25T01:30:00Z"), "Europe/Berlin")).toEqual({
      date: "2026-10-25",
      hour: 2,
      minute: 30,
    });
  });
});

describe("minutesOfDay", () => {
  it("converts the wall clock to minutes", () => {
    expect(minutesOfDay({ date: "2026-10-09", hour: 0, minute: 0 })).toBe(0);
    expect(minutesOfDay({ date: "2026-10-09", hour: 23, minute: 59 })).toBe(1439);
  });
});

describe("addDays", () => {
  it("crosses month, year and DST boundaries", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects garbage", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("formatElapsed", () => {
  const at = new Date("2026-10-09T10:00:00Z");
  const ago = (seconds: number) => new Date(at.getTime() - seconds * 1000);

  it("never shows clock time", () => {
    expect(formatElapsed(ago(0), at)).toBe("just now");
    expect(formatElapsed(ago(59), at)).toBe("just now");
    expect(formatElapsed(ago(60), at)).toBe("1 min");
    expect(formatElapsed(ago(90 * 60), at)).toBe("1 h 30 min");
    expect(formatElapsed(ago(120 * 60), at)).toBe("2 h");
  });

  it("clamps future timestamps", () => {
    expect(formatElapsed(new Date(at.getTime() + 60_000), at)).toBe("just now");
  });
});
