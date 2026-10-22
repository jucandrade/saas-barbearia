/**
 * Comparison key of a service or category name (FR-004): trimmed, Unicode NFC and lowercased.
 * Computed in the domain, so uniqueness does not depend on the database locale.
 */
export function normalizeName(name: string): string {
  return name.trim().normalize("NFC").toLocaleLowerCase("pt-BR");
}
