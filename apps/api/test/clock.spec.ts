import { describe, expect, it } from "vitest";
import { ControllableClock, SystemClock } from "../src/identity/clock.js";

describe("SystemClock", () => {
  it("returns the current time", () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe("ControllableClock", () => {
  it("stays stopped until advanced", () => {
    const clock = new ControllableClock(new Date("2026-01-01T00:00:00.000Z"));
    expect(clock.now()).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    clock.advance(15 * 60 * 1000);
    expect(clock.now()).toEqual(new Date("2026-01-01T00:15:00.000Z"));
  });

  it("can be set to a date", () => {
    const clock = new ControllableClock();
    clock.setTime(new Date("2027-05-05T10:00:00.000Z"));
    expect(clock.now()).toEqual(new Date("2027-05-05T10:00:00.000Z"));
  });

  it("does not expose its internal state by mutation", () => {
    const clock = new ControllableClock(new Date("2026-01-01T00:00:00.000Z"));
    clock.now().setFullYear(2000);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });
});
