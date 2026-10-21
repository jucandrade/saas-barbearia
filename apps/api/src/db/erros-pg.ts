/** Código SQLSTATE do erro do Postgres, mesmo embrulhado pelo Drizzle (`cause`). */
export function codigoPg(erro: unknown): string | undefined {
  const interno = erro instanceof Error ? erro.cause : undefined;
  for (const candidato of [interno, erro]) {
    if (
      candidato !== null &&
      typeof candidato === "object" &&
      "code" in candidato &&
      typeof candidato.code === "string"
    ) {
      return candidato.code;
    }
  }
  return undefined;
}

/** Mensagem do `RAISE EXCEPTION` de um gatilho (por exemplo, `ULTIMO_DONO`). */
export function mensagemPg(erro: unknown): string | undefined {
  const interno = erro instanceof Error ? erro.cause : undefined;
  if (interno instanceof Error) {
    return interno.message;
  }
  return erro instanceof Error ? erro.message : undefined;
}

export const VIOLACAO_DE_UNICIDADE = "23505";
