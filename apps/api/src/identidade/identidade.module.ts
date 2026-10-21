import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AuditoriaService } from "./auditoria/auditoria.service.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { OrigemGuard } from "./auth/origem.guard.js";
import { SessaoService } from "./auth/sessao.service.js";
import { EmailPort } from "./email/email.port.js";
import { SmtpAdapter } from "./email/smtp.adapter.js";
import { FiltroDeErros } from "./http/filtro-de-erros.js";
import { Relogio, RelogioDoSistema } from "./relogio.js";
import { SenhaService } from "./seguranca/senha.service.js";

/** Bounded context "Identidade e Tenancy" (princípio VI). */
@Module({
  providers: [
    { provide: Relogio, useClass: RelogioDoSistema },
    { provide: EmailPort, useClass: SmtpAdapter },
    SenhaService,
    SessaoService,
    AuditoriaService,
    { provide: APP_GUARD, useClass: OrigemGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: FiltroDeErros },
  ],
  exports: [Relogio, EmailPort, SenhaService, SessaoService, AuditoriaService],
})
export class IdentidadeModule {}
