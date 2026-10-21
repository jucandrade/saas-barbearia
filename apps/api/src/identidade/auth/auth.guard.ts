import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@barbearia/domain";
import { ErroApi } from "../http/erro-api.js";
import type { RequisicaoHttp } from "../http/tipos-http.js";
import { lerCookie, NOME_COOKIE_SESSAO } from "./cookie.js";
import { PAPEIS, PUBLICA } from "./decorators.js";
import { SessaoService } from "./sessao.service.js";

function valorDe(cabecalho: string | string[] | undefined): string | undefined {
  return Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
}

/** Extrai o token de sessão: `Authorization: Bearer` (mobile) ou cookie (web). */
export function tokenDaRequisicao(req: RequisicaoHttp): string | undefined {
  const autorizacao = valorDe(req.headers["authorization"]);
  if (autorizacao?.startsWith("Bearer ") === true) {
    return autorizacao.slice("Bearer ".length).trim();
  }
  return lerCookie(valorDe(req.headers["cookie"]), NOME_COOKIE_SESSAO);
}

/** Guard global: toda rota exige sessão válida, salvo as marcadas com `@Publica()`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessoes: SessaoService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const alvos = [contexto.getHandler(), contexto.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(PUBLICA, alvos) ===
      true
    ) {
      return true;
    }

    const req = contexto.switchToHttp().getRequest<RequisicaoHttp>();
    const token = tokenDaRequisicao(req);
    const sessao =
      token === undefined || token === ""
        ? undefined
        : await this.sessoes.resolver(token);
    if (sessao === undefined) {
      throw new ErroApi(
        401,
        "SESSAO_INVALIDA",
        "Sessão inválida ou expirada. Entre novamente.",
      );
    }

    const papeis = this.reflector.getAllAndOverride<Papel[] | undefined>(
      PAPEIS,
      alvos,
    );
    if (papeis !== undefined && !papeis.includes(sessao.papel)) {
      throw new ErroApi(
        403,
        "SEM_PERMISSAO",
        "Você não tem permissão para esta ação.",
      );
    }

    req.autenticado = sessao;
    return true;
  }
}
