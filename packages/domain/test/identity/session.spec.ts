import { describe, expect, it } from "vitest";
import {
  calculateExpiration,
  sessionDuration,
  sessionIsCurrent,
} from "../../src/identity/session.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date("2026-10-21T12:00:00.000Z");

describe("sessionDuration", () => {
  it("dono: 12 horas", () => {
    expect(sessionDuration("owner")).toBe(12 * HOUR);
  });

  it("barbeiro: 30 dias", () => {
    expect(sessionDuration("barber")).toBe(30 * DAY);
  });
});

describe("calculateExpiration", () => {
  it("adds the duration to the given time, without reading the clock", () => {
    expect(calculateExpiration("owner", now)).toEqual(
      new Date("2026-10-22T00:00:00.000Z"),
    );
    expect(calculateExpiration("barber", now)).toEqual(
      new Date("2026-11-20T12:00:00.000Z"),
    );
  });

  it("does not change the given date", () => {
    const copy = new Date(now);
    calculateExpiration("owner", now);
    expect(now).toEqual(copy);
  });
});

describe("sessionIsCurrent", () => {
  const future = new Date(now.getTime() + HOUR);

  it("is current when not revoked and not expired", () => {
    expect(sessionIsCurrent({ expiresAt: future, revokedAt: null }, now)).toBe(
      true,
    );
  });

  it("is not current if revoked", () => {
    expect(sessionIsCurrent({ expiresAt: future, revokedAt: now }, now)).toBe(
      false,
    );
  });

  it("is not current if expired, including exactly at expiration time", () => {
    expect(sessionIsCurrent({ expiresAt: now, revokedAt: null }, now)).toBe(
      false,
    );
  });
});
