import { Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import pg from "pg";
import { ConfigModule, ENV, type Env } from "../config/config.module.js";
import { POOL, TenantDb } from "../db/tenant-db.js";
import { AuditService } from "../identity/audit/audit.service.js";
import { InvitationIssuer } from "../identity/invitations/invitation-issuer.js";
import { EmailPort } from "../identity/email/email.port.js";
import { SmtpAdapter } from "../identity/email/smtp.adapter.js";
import { SessionService } from "../identity/auth/session.service.js";
import { AnonymizationService } from "../identity/provisioning/anonymization.service.js";
import { ProvisioningService } from "../identity/provisioning/provisioning.service.js";
import { OwnerInvitationResendService } from "../identity/provisioning/owner-invitation-resend.service.js";
import { Clock, SystemClock } from "../identity/clock.js";

/**
 * Module for the product team's commands: the same `TenantDb`, but wired to the
 * admin connection. RLS still applies (R2), so every command sets the tenant
 * context before writing.
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
    { provide: Clock, useClass: SystemClock },
    { provide: EmailPort, useClass: SmtpAdapter },
    TenantDb,
    AuditService,
    InvitationIssuer,
    SessionService,
    ProvisioningService,
    OwnerInvitationResendService,
    AnonymizationService,
  ],
})
export class CliModule implements OnModuleDestroy {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
