import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  AceitarConviteEntrada,
  type ConviteInfo,
  type SessaoSaida,
} from "@barbearia/contracts";
import { ENV, type Env } from "../../config/config.module.js";
import { Publica } from "../auth/decorators.js";
import { responderComSessao } from "../auth/sessao-http.js";
import { ZodPipe } from "../http/zod.pipe.js";
import type { RespostaHttp } from "../http/tipos-http.js";
import { ConvitesService } from "./convites.service.js";

@Publica()
@UseGuards(ThrottlerGuard)
@Controller("auth/convites")
export class ConvitesController {
  constructor(
    private readonly convites: ConvitesService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get(":token")
  consultar(@Param("token") token: string): Promise<ConviteInfo> {
    return this.convites.consultar(token);
  }

  @Post("aceitar")
  @HttpCode(200)
  async aceitar(
    @Body(new ZodPipe(AceitarConviteEntrada)) entrada: AceitarConviteEntrada,
    @Res({ passthrough: true }) res: RespostaHttp,
  ): Promise<SessaoSaida> {
    const { usuario, token } = await this.convites.aceitar(entrada);
    return responderComSessao(res, this.env, entrada.cliente, token, usuario);
  }
}
