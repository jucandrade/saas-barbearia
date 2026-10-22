/** Validity of the access links (spec clarifications). */
export const INVITATION_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;
export const RECOVERY_VALIDITY_MS = 60 * 60 * 1000;

export type TokenPurpose = "invitation" | "recovery";

export interface TokenToEvaluate {
  expiresAt: Date;
  usedAt: Date | null;
  invalidatedAt: Date | null;
}

export function calculateTokenExpiration(
  purpose: TokenPurpose,
  now: Date,
): Date {
  const validity =
    purpose === "invitation" ? INVITATION_VALIDITY_MS : RECOVERY_VALIDITY_MS;
  return new Date(now.getTime() + validity);
}

/** Single use: valid only if not used, not replaced and not expired. */
export function tokenIsCurrent(token: TokenToEvaluate, now: Date): boolean {
  return (
    token.usedAt === null &&
    token.invalidatedAt === null &&
    token.expiresAt.getTime() > now.getTime()
  );
}
