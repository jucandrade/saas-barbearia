import type { z } from "zod";
import { Erro } from "@barbearia/contracts";

// O Next só inlina variáveis públicas lidas com acesso por ponto.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/** Erro devolvido pela API no formato `{ codigo, mensagem, campos? }`. */
export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly campos: Record<string, string> = {},
  ) {
    super(mensagem);
    this.name = "ErroDaApi";
  }
}

async function requisitar(
  caminho: string,
  metodo: "GET" | "POST",
  corpo: unknown,
): Promise<Response> {
  const init: RequestInit = { method: metodo, credentials: "include" };
  if (corpo !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(corpo);
  }
  try {
    return await fetch(`${BASE}${caminho}`, init);
  } catch {
    throw new ErroDaApi(
      0,
      "SEM_CONEXAO",
      "Não foi possível falar com o servidor. Tente de novo.",
    );
  }
}

async function erroDaResposta(resposta: Response): Promise<ErroDaApi> {
  const erro = Erro.safeParse(await resposta.json().catch(() => undefined));
  return erro.success
    ? new ErroDaApi(
        resposta.status,
        erro.data.codigo,
        erro.data.mensagem,
        erro.data.campos,
      )
    : new ErroDaApi(
        resposta.status,
        "ERRO_INESPERADO",
        "Algo deu errado. Tente de novo.",
      );
}

interface Opcoes<S extends z.ZodType> {
  metodo?: "GET" | "POST";
  corpo?: unknown;
  /** Schema de `@barbearia/contracts` que valida a resposta de sucesso. */
  schema: S;
}

/** Chama a API com a sessão por cookie e valida a resposta com o contrato. */
export async function chamar<S extends z.ZodType>(
  caminho: string,
  { metodo = "GET", corpo, schema }: Opcoes<S>,
): Promise<z.output<S>> {
  const resposta = await requisitar(caminho, metodo, corpo);
  if (!resposta.ok) {
    throw await erroDaResposta(resposta);
  }
  return schema.parse(await resposta.json());
}

/** Chamada cuja resposta de sucesso não tem corpo (`204`). */
export async function chamarSemResposta(
  caminho: string,
  corpo?: unknown,
): Promise<void> {
  const resposta = await requisitar(caminho, "POST", corpo);
  if (!resposta.ok) {
    throw await erroDaResposta(resposta);
  }
}
