import { describe, expect, it } from "vitest";
import {
  calculateTokenExpiration,
  tokenIsCurrent,
  INVITATION_VALIDITY_MS,
  RECOVERY_VALIDITY_MS,
} from "../../src/identity/token.js";

const now = new Date("2026-10-21T12:00:00.000Z");
const future = new Date(now.getTime() + 1000);

describe("validities", () => {
  it("invitation: 7 days; recovery: 1 hour", () => {
    expect(INVITATION_VALIDITY_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(RECOVERY_VALIDITY_MS).toBe(60 * 60 * 1000);
  });
});

describe("calculateTokenExpiration", () => {
  it("adds the purpose's validity to the given time", () => {
    expect(calculateTokenExpiration("invitation", now)).toEqual(
      new Date("2026-10-28T12:00:00.000Z"),
    );
    expect(calculateTokenExpiration("recovery", now)).toEqual(
      new Date("2026-10-21T13:00:00.000Z"),
    );
  });
});

describe("tokenIsCurrent", () => {
  it("is current when unused, not invalidated and not expired", () => {
    expect(
      tokenIsCurrent(
        { expiresAt: future, usedAt: null, invalidatedAt: null },
        now,
      ),
    ).toBe(true);
  });

  it("is not current if already used", () => {
    expect(
      tokenIsCurrent(
        { expiresAt: future, usedAt: now, invalidatedAt: null },
        now,
      ),
    ).toBe(false);
  });

  it("is not current if invalidated by a newer token", () => {
    expect(
      tokenIsCurrent(
        { expiresAt: future, usedAt: null, invalidatedAt: now },
        now,
      ),
    ).toBe(false);
  });

  it("expiring exactly now is already invalid", () => {
    expect(
      tokenIsCurrent(
        { expiresAt: now, usedAt: null, invalidatedAt: null },
        now,
      ),
    ).toBe(false);
  });
});
