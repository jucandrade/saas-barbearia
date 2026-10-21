import { normalizeEmail } from "./email.js";
import { COMMON_PASSWORDS } from "./common-passwords.js";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export type InvalidPasswordReason =
  "short" | "long" | "common" | "equals_email" | "equals_name";

export type PasswordResult =
  { valid: true } | { valid: false; reason: InvalidPasswordReason };

export interface PasswordContext {
  email: string;
  name: string;
}

/**
 * Password policy (FR-011): between 8 and 128 characters, outside the common-password
 * list and different from the user's e-mail and name. No composition rules.
 */
export function validatePassword(
  password: string,
  context: PasswordContext,
): PasswordResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, reason: "short" };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { valid: false, reason: "long" };
  }
  const lowercase = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowercase)) {
    return { valid: false, reason: "common" };
  }
  if (lowercase === normalizeEmail(context.email)) {
    return { valid: false, reason: "equals_email" };
  }
  if (lowercase === context.name.trim().toLowerCase()) {
    return { valid: false, reason: "equals_name" };
  }
  return { valid: true };
}
