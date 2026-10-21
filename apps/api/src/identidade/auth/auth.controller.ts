import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { asc, eq } from "drizzle-orm";
import {
  LoginEntrada,
  type EuSaida,
  type SessaoSaida,
} from "@barbearia/contracts";
import { ENV, type Env } from "../../config/config.module.js";
import { barbearia, unidade, usuario } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { ErroApi } from "../http/erro-api.js";
import type { RespostaHttp, UsuarioAutenticado } from "../http/tipos-http.js";
import { ZodPipe } from "../http/zod.pipe.js";
import { AuthService } from "./auth.service.js";
import { cookieDeLimpeza } from "./cookie.js";
import { Publica, UsuarioAtual } from "./decorators.js";
import { responderComSessao } from "./sessao-http.js";

const sessaoInvalida = (): ErroApi =>
  new ErroApi(
    401,
    "SESSAO_INVALIDA",
    "Sessão inválida ou expirada. Entre novamente.",
  );

@Controller("auth")
export class AuthController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Publica()
  @UseGuards(ThrottlerGuard)
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginEntrada)) entrada: LoginEntrada,
    @Res({ passthrough: true }) res: RespostaHttp,
  ): Promise<SessaoSaida> {
    const { usuario: logado, token } = await this.auth.login(entrada);
    return responderComSessao(res, this.env, entrada.cliente, token, logado);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @UsuarioAtual() atual: UsuarioAutenticado | undefined,
    @Res({ passthrough: true }) res: RespostaHttp,
  ): Promise<void> {
    if (atual === undefined) {
      throw sessaoInvalida();
    }
    await this.auth.logout(atual);
    res.setHeader("Set-Cookie", cookieDeLimpeza(this.env.cookieSeguro));
  }

  /** Quem está logado e a barbearia dele; a RLS garante que é só a própria. */
  @Get("eu")
  eu(@UsuarioAtual() atual: UsuarioAutenticado | undefined): Promise<EuSaida> {
    if (atual === undefined) {
      throw sessaoInvalida();
    }
    return this.tenantDb.transacao(atual.tenantId, async (tx) => {
      const [eu] = await tx
        .select()
        .from(usuario)
        .where(eq(usuario.id, atual.usuarioId));
      const [loja] = await tx.select().from(barbearia);
      const unidades = await tx
        .select()
        .from(unidade)
        .orderBy(asc(unidade.criadaEm));
      if (eu === undefined || loja === undefined) {
        throw sessaoInvalida();
      }
      return {
        usuario: {
          id: eu.id,
          nome: eu.nome,
          email: eu.email,
          papel: eu.papel,
          situacao: eu.situacao === "anonimizado" ? "desativado" : eu.situacao,
          barbeariaId: eu.tenantId,
        },
        barbearia: {
          id: loja.id,
          nome: loja.nome,
          unidades: unidades.map((u) => ({
            id: u.id,
            nome: u.nome,
            fusoHorario: u.fusoHorario,
          })),
        },
      };
    });
  }
}
