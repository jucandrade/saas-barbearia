import type { Role } from "./role.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Tolerated inactivity per role (FR-013): owner 12 hours, barber 30 days. */
export function sessionDuration(role: Role): number {
  return role === "owner" ? 12 * HOUR_MS : 30 * DAY_MS;
}

/** Expiration time of a session used at `now` (the clock comes from outside). */
export function calculateExpiration(role: Role, now: Date): Date {
  return new Date(now.getTime() + sessionDuration(role));
}

export interface SessionToEvaluate {
  expiresAt: Date;
  revokedAt: Date | null;
}

export function sessionIsCurrent(
  session: SessionToEvaluate,
  now: Date,
): boolean {
  return (
    session.revokedAt === null && session.expiresAt.getTime() > now.getTime()
  );
}
