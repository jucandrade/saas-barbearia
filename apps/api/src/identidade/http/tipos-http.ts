import type { Papel } from "@barbearia/domain";

/** Só o que o código usa do Express, para não depender dos tipos dele. */
export interface RequisicaoHttp {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  route?: { path?: string };
  autenticado?: UsuarioAutenticado;
}

export interface RespostaHttp {
  status(codigo: number): RespostaHttp;
  setHeader(nome: string, valor: string | string[]): unknown;
  json(corpo: unknown): unknown;
}

export interface UsuarioAutenticado {
  sessaoId: string;
  usuarioId: string;
  tenantId: string;
  papel: Papel;
}
