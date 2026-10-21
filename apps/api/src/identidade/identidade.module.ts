import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ENV, type Env } from "../config/config.module.js";
import { AuditoriaService } from "./auditoria/auditoria.service.js";
import { AuthController } from "./auth/auth.controller.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { AuthService } from "./auth/auth.service.js";
import { OrigemGuard } from "./auth/origem.guard.js";
import { SessaoService } from "./auth/sessao.service.js";
import { ConvitesController } from "./convites/convites.controller.js";
import { ConvitesEmissor } from "./convites/convites-emissor.js";
import { ConvitesService } from "./convites/convites.service.js";
import { EmailPort } from "./email/email.port.js";
import { SmtpAdapter } from "./email/smtp.adapter.js";
import { FiltroDeErros } from "./http/filtro-de-erros.js";
import { Relogio, RelogioDoSistema } from "./relogio.js";
import { SenhaService } from "./seguranca/senha.service.js";

/** Bounded context "Identidade e Tenancy" (princípio VI). */
@Module({
  imports: [
    // Limite por origem (FR-015): em memória basta enquanto houver uma só instância da API (R8).
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => [{ ttl: 60_000, limit: env.limitePorMinuto }],
    }),
  ],
  controllers: [AuthController, ConvitesController],
  providers: [
    { provide: Relogio, useClass: RelogioDoSistema },
    { provide: EmailPort, useClass: SmtpAdapter },
    SenhaService,
    SessaoService,
    AuthService,
    AuditoriaService,
    ConvitesEmissor,
    ConvitesService,
    { provide: APP_GUARD, useClass: OrigemGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: FiltroDeErros },
  ],
  exports: [
    Relogio,
    EmailPort,
    SenhaService,
    SessaoService,
    AuditoriaService,
    ConvitesEmissor,
  ],
})
export class IdentidadeModule {}
