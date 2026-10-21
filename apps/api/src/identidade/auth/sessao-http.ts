import type { Cliente, Usuario } from "@barbearia/contracts";
import type { Env } from "../../config/env.js";
import type { RespostaHttp } from "../http/tipos-http.js";
import { cookieDeSessao } from "./cookie.js";

/**
 * Entrega a sessão ao cliente: `web` recebe cookie `HttpOnly` e nenhum token no
 * corpo; `mobile` recebe o token no corpo, para guardar em armazenamento seguro (R4).
 */
export function responderComSessao(
  res: RespostaHttp,
  env: Env,
  cliente: Cliente,
  token: string,
  usuario: Usuario,
): { usuario: Usuario; token?: string } {
  if (cliente === "web") {
    res.setHeader("Set-Cookie", cookieDeSessao(token, env.cookieSeguro));
    return { usuario };
  }
  return { usuario, token };
}
