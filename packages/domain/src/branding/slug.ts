export const MIN_SLUG_LENGTH = 3;
export const MAX_SLUG_LENGTH = 40;

const FALLBACK = "barbearia";
const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** True for a public link identifier: lowercase letters, digits and single hyphens, 3 to 40 characters. */
export function isValidSlug(value: string): boolean {
  return (
    value.length >= MIN_SLUG_LENGTH &&
    value.length <= MAX_SLUG_LENGTH &&
    SLUG_FORMAT.test(value)
  );
}

function trimHyphens(text: string): string {
  return text.replace(/^-+|-+$/g, "");
}

/**
 * Public link identifier built from the barbershop name: lowercase ASCII letters and
 * digits separated by single hyphens, 3 to 40 characters (R2). Always returns a valid slug.
 */
export function slugify(name: string): string {
  const base = trimHyphens(
    name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-"),
  );
  const limited = trimHyphens(base.slice(0, MAX_SLUG_LENGTH));
  if (limited.length === 0) {
    return FALLBACK;
  }
  if (limited.length < MIN_SLUG_LENGTH) {
    return `${FALLBACK}-${limited}`;
  }
  return limited;
}

/** Adds `-n` to resolve a collision, cutting the base so the total stays within 40 characters. */
export function withSuffix(slug: string, n: number): string {
  const suffix = `-${n.toString()}`;
  const base = trimHyphens(slug.slice(0, MAX_SLUG_LENGTH - suffix.length));
  return `${base}${suffix}`;
}
