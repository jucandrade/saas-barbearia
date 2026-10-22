export const MAX_NAME_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 480;
export const DURATION_STEP_MINUTES = 5;
export const MAX_PRICE_CENTS = 1_000_000;

export type Validation<T, Reason extends string> =
  { ok: true; value: T } | { ok: false; reason: Reason };

export type DurationProblem =
  "not_integer" | "out_of_range" | "not_multiple_of_step";
export type PriceProblem = "not_integer" | "out_of_range";
export type NameProblem = "empty" | "too_long";
export type DescriptionProblem = "too_long";

/** Duration in whole minutes: a multiple of 5, from 5 to 480 (FR-003). */
export function validateDuration(
  minutes: number,
): Validation<number, DurationProblem> {
  if (!Number.isInteger(minutes)) {
    return { ok: false, reason: "not_integer" };
  }
  if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) {
    return { ok: false, reason: "out_of_range" };
  }
  if (minutes % DURATION_STEP_MINUTES !== 0) {
    return { ok: false, reason: "not_multiple_of_step" };
  }
  return { ok: true, value: minutes };
}

/** Price in whole cents, from 0 to R$ 10.000,00 (FR-003, constitution II). */
export function validatePrice(cents: number): Validation<number, PriceProblem> {
  if (!Number.isInteger(cents)) {
    return { ok: false, reason: "not_integer" };
  }
  if (cents < 0 || cents > MAX_PRICE_CENTS) {
    return { ok: false, reason: "out_of_range" };
  }
  return { ok: true, value: cents };
}

function validateName(name: string): Validation<string, NameProblem> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, value: trimmed };
}

/** Service name: 1 to 80 characters after trimming (FR-001). */
export const validateServiceName = validateName;

/** Category name: 1 to 80 characters after trimming (FR-018). */
export const validateCategoryName = validateName;

/** Description: optional, up to 500 characters; empty becomes `null` (FR-001). */
export function validateDescription(
  description: string | null | undefined,
): Validation<string | null, DescriptionProblem> {
  const trimmed = description?.trim() ?? "";
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, value: trimmed };
}
