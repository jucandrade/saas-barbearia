/** "R$ 50,00" from whole cents. Integer arithmetic only: money never goes through floating point. */
export function formatPrice(cents: number): string {
  const reais = Math.floor(cents / 100);
  const rest = cents % 100;
  return `R$ ${String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${String(rest).padStart(2, "0")}`;
}
