/** "R$ 50,00" from whole cents. Integer arithmetic only: money never goes through floating point. */
export function formatPrice(cents: number): string {
  const reais = Math.floor(cents / 100);
  const rest = cents % 100;
  return `R$ ${reais.toLocaleString("pt-BR")},${String(rest).padStart(2, "0")}`;
}

/** Cents from what the owner types ("50", "50,5", "R$ 1.250,00"); `undefined` when it is not a price. */
export function parsePrice(text: string): number | undefined {
  const cleaned = text.replace(/R\$|\s/g, "").replace(/\./g, "");
  const match = /^(\d+)(?:,(\d{1,2}))?$/.exec(cleaned);
  if (match === null) {
    return undefined;
  }
  const reais = Number(match[1]);
  const cents = Number((match[2] ?? "0").padEnd(2, "0"));
  return reais * 100 + cents;
}

/** The editable text of a price: "50,00". */
export function priceToInput(cents: number): string {
  return `${String(Math.floor(cents / 100))},${String(cents % 100).padStart(2, "0")}`;
}
