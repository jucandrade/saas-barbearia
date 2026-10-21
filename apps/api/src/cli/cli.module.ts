import { Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import pg from "pg";
import { ConfigModule, ENV, type Env } from "../config/config.module.js";
import { POOL, TenantDb } from "../db/tenant-db.js";
import { AuditoriaService } from "../identidade/auditoria/auditoria.service.js";
import { ConvitesEmissor } from "../identidade/convites/convites-emissor.js";
import { EmailPort } from "../identidade/email/email.port.js";
import { SmtpAdapter } from "../identidade/email/smtp.adapter.js";
import { SessaoService } from "../identidade/auth/sessao.service.js";
import { AnonimizacaoService } from "../identidade/provisionamento/anonimizacao.service.js";
import { ProvisionamentoService } from "../identidade/provisionamento/provisionamento.service.js";
import { ReenvioConviteDonoService } from "../identidade/provisionamento/reenvio-convite-dono.service.js";
import { Relogio, RelogioDoSistema } from "../identidade/relogio.js";

/**
 * Módulo dos comandos da equipe do produto: o mesmo `TenantDb`, mas ligado à
 * conexão administrativa. A RLS continua valendo (R2), por isso todo comando
 * define o contexto do tenant antes de escrever.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: POOL,
      inject: [ENV],
      useFactory: (env: Env): pg.Pool =>
        new pg.Pool({ connectionString: env.databaseAdminUrl, max: 2 }),
    },
    { provide: Relogio, useClass: RelogioDoSistema },
    { provide: EmailPort, useClass: SmtpAdapter },
    TenantDb,
    AuditoriaService,
    ConvitesEmissor,
    SessaoService,
    ProvisionamentoService,
    ReenvioConviteDonoService,
    AnonimizacaoService,
  ],
})
export class CliModule implements OnModuleDestroy {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
