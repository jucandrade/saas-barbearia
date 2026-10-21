/** Normaliza o e-mail: sem espaços nas pontas e em minúsculas (FR-006). */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}
