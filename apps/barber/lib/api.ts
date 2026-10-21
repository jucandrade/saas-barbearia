import type { z } from "zod";
import { Erro } from "@barbearia/contracts";

// No emulador Android o servidor do computador é `10.0.2.2`; no aparelho, o IP da máquina.
// O Expo só inlina variáveis públicas lidas com acesso por ponto.
const BASE =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ??
  "http://localhost:3000";

/** Erro devolvido pela API no formato `{ codigo, mensagem, campos? }`. */
export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDaApi";
  }
}

async function requisitar(
  caminho: string,
  metodo: "GET" | "POST",
  corpo: unknown,
  token: string | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  const init: RequestInit = { method: metodo, headers };
  if (corpo !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(corpo);
  }
  if (token !== undefined) {
    headers["Authorization"] = `Bearer ${token}`;
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
    ? new ErroDaApi(resposta.status, erro.data.codigo, erro.data.mensagem)
    : new ErroDaApi(
        resposta.status,
        "ERRO_INESPERADO",
        "Algo deu errado. Tente de novo.",
      );
}

/** Chama a API com o token de sessão (`Bearer`) e valida a resposta com o contrato. */
export async function chamar<S extends z.ZodType>(
  caminho: string,
  opcoes: {
    metodo?: "GET" | "POST";
    corpo?: unknown;
    token?: string;
    schema: S;
  },
): Promise<z.output<S>> {
  const resposta = await requisitar(
    caminho,
    opcoes.metodo ?? "GET",
    opcoes.corpo,
    opcoes.token,
  );
  if (!resposta.ok) {
    throw await erroDaResposta(resposta);
  }
  return opcoes.schema.parse(await resposta.json());
}

/** Chamada cuja resposta de sucesso não tem corpo (`204`). */
export async function chamarSemResposta(
  caminho: string,
  token: string,
): Promise<void> {
  const resposta = await requisitar(caminho, "POST", undefined, token);
  if (!resposta.ok) {
    throw await erroDaResposta(resposta);
  }
}
