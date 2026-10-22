/** Normalizes the e-mail: trimmed and lowercased (FR-006). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
