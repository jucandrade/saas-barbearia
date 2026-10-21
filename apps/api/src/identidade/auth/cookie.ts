export const NOME_COOKIE_SESSAO = "sessao";
const TRINTA_DIAS_S = 30 * 24 * 60 * 60;

/** Lê um cookie do cabeçalho `Cookie`, sem biblioteca. */
export function lerCookie(
  cabecalho: string | undefined,
  nome: string,
): string | undefined {
  if (cabecalho === undefined) {
    return undefined;
  }
  for (const parte of cabecalho.split(";")) {
    const posicao = parte.indexOf("=");
    if (posicao > 0 && parte.slice(0, posicao).trim() === nome) {
      return decodeURIComponent(parte.slice(posicao + 1).trim());
    }
  }
  return undefined;
}

function atributos(seguro: boolean): string {
  return `Path=/; HttpOnly; SameSite=Lax${seguro ? "; Secure" : ""}`;
}

/** O cookie dura o máximo; quem decide a validade da sessão é o servidor (R4). */
export function cookieDeSessao(token: string, seguro: boolean): string {
  return `${NOME_COOKIE_SESSAO}=${encodeURIComponent(token)}; Max-Age=${String(TRINTA_DIAS_S)}; ${atributos(seguro)}`;
}

export function cookieDeLimpeza(seguro: boolean): string {
  return `${NOME_COOKIE_SESSAO}=; Max-Age=0; ${atributos(seguro)}`;
}
