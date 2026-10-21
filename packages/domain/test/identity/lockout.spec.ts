import { describe, expect, it } from "vitest";
import {
  evaluateLoginAttempt,
  LOCKOUT_DURATION_MS,
  MAX_LOGIN_FAILURES,
  recordLoginFailure,
  recordLoginSuccess,
  type LoginState,
} from "../../src/identity/lockout.js";

const now = new Date("2026-10-21T12:00:00.000Z");
const clean: LoginState = { failedAttempts: 0, lockedUntil: null };

describe("constants", () => {
  it("5 consecutive failures and a 15-minute lockout", () => {
    expect(MAX_LOGIN_FAILURES).toBe(5);
    expect(LOCKOUT_DURATION_MS).toBe(15 * 60 * 1000);
  });
});

describe("recordLoginFailure", () => {
  it("increments failedAttempts without locking before the 5th", () => {
    const state = recordLoginFailure({ ...clean, failedAttempts: 3 }, now);
    expect(state).toEqual({ failedAttempts: 4, lockedUntil: null });
  });

  it("the 5th consecutive failure locks for 15 minutes", () => {
    const state = recordLoginFailure({ ...clean, failedAttempts: 4 }, now);
    expect(state.failedAttempts).toBe(5);
    expect(state.lockedUntil).toEqual(new Date("2026-10-21T12:15:00.000Z"));
  });

  it("does not change the state while the account is already locked", () => {
    const locked: LoginState = {
      failedAttempts: 5,
      lockedUntil: new Date("2026-10-21T12:10:00.000Z"),
    };
    expect(recordLoginFailure(locked, now)).toEqual(locked);
  });

  it("does not mutate the received state", () => {
    const input = { ...clean, failedAttempts: 1 };
    recordLoginFailure(input, now);
    expect(input).toEqual({ failedAttempts: 1, lockedUntil: null });
  });
});

describe("evaluateLoginAttempt", () => {
  it("is released when there is no lockout", () => {
    expect(evaluateLoginAttempt(clean, now)).toEqual({
      locked: false,
      state: clean,
    });
  });

  it("is locked while lockedUntil is in the future", () => {
    const state: LoginState = {
      failedAttempts: 5,
      lockedUntil: new Date("2026-10-21T12:00:00.001Z"),
    };
    expect(evaluateLoginAttempt(state, now)).toEqual({ locked: true });
  });

  it("releases and resets the counter once the lockout has passed, including at the exact time", () => {
    const state: LoginState = { failedAttempts: 5, lockedUntil: now };
    expect(evaluateLoginAttempt(state, now)).toEqual({
      locked: false,
      state: clean,
    });
  });
});

describe("recordLoginSuccess", () => {
  it("zera tentativasFalhas e bloqueadoAte", () => {
    expect(recordLoginSuccess()).toEqual(clean);
  });
});
