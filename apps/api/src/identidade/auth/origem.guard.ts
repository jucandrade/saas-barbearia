import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ENV, type Env } from "../../config/config.module.js";
import { ErroApi } from "../http/erro-api.js";
import type { RequisicaoHttp } from "../http/tipos-http.js";
import { lerCookie, NOME_COOKIE_SESSAO } from "./cookie.js";

const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Proteção contra CSRF para a sessão por cookie: requisição que altera estado e
 * traz o cookie precisa vir da origem do admin. O app mobile usa `Bearer` e não
 * é afetado.
 */
@Injectable()
export class OrigemGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(contexto: ExecutionContext): boolean {
    const req = contexto.switchToHttp().getRequest<RequisicaoHttp>();
    if (METODOS_SEGUROS.has(req.method.toUpperCase())) {
      return true;
    }
    const cabecalho = req.headers["cookie"];
    const cookie = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
    if (lerCookie(cookie, NOME_COOKIE_SESSAO) === undefined) {
      return true;
    }
    const origem = req.headers["origin"];
    if (
      (Array.isArray(origem) ? origem[0] : origem) !== this.env.adminBaseUrl
    ) {
      throw new ErroApi(
        403,
        "ORIGEM_INVALIDA",
        "Origem da requisição não permitida.",
      );
    }
    return true;
  }
}
