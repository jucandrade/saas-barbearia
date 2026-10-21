/** Per-account login lockout (FR-015): 5 consecutive failures, 15 minutes. */
export const MAX_LOGIN_FAILURES = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface LoginState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

export type LoginEvaluation =
  { locked: true } | { locked: false; state: LoginState };

function isLocked(state: LoginState, now: Date): boolean {
  return (
    state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime()
  );
}

/** Says whether the attempt may proceed; once the lockout has passed, returns the reset state. */
export function evaluateLoginAttempt(
  state: LoginState,
  now: Date,
): LoginEvaluation {
  if (isLocked(state, now)) {
    return { locked: true };
  }
  if (state.lockedUntil !== null) {
    return { locked: false, state: recordLoginSuccess() };
  }
  return { locked: false, state };
}

export function recordLoginFailure(state: LoginState, now: Date): LoginState {
  if (isLocked(state, now)) {
    return state;
  }
  const failedAttempts = state.failedAttempts + 1;
  return {
    failedAttempts,
    lockedUntil:
      failedAttempts >= MAX_LOGIN_FAILURES
        ? new Date(now.getTime() + LOCKOUT_DURATION_MS)
        : null,
  };
}

export function recordLoginSuccess(): LoginState {
  return { failedAttempts: 0, lockedUntil: null };
}
