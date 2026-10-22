import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ENV, type Env } from "../config/config.module.js";
import { AuditService } from "./audit/audit.service.js";
import { AuthController } from "./auth/auth.controller.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { AuthService } from "./auth/auth.service.js";
import { OriginGuard } from "./auth/origin.guard.js";
import { SessionService } from "./auth/session.service.js";
import { InvitationsController } from "./invitations/invitations.controller.js";
import { InvitationIssuer } from "./invitations/invitation-issuer.js";
import { InvitationsService } from "./invitations/invitations.service.js";
import { EmailPort } from "./email/email.port.js";
import { RecoveryController } from "./recovery/recovery.controller.js";
import { RecoveryService } from "./recovery/recovery.service.js";
import { SmtpAdapter } from "./email/smtp.adapter.js";
import { TeamController } from "./team/team.controller.js";
import { TeamService } from "./team/team.service.js";
import { ErrorFilter } from "./http/error-filter.js";
import { Clock, SystemClock } from "./clock.js";
import { PasswordService } from "./security/password.service.js";

/** Bounded context "Identity and Tenancy" (principle VI). */
@Module({
  imports: [
    // Per-origin limit (FR-015): in memory is enough while there is a single API instance (R8).
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => [{ ttl: 60_000, limit: env.limitPerMinute }],
    }),
  ],
  controllers: [
    AuthController,
    InvitationsController,
    TeamController,
    RecoveryController,
  ],
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: EmailPort, useClass: SmtpAdapter },
    PasswordService,
    SessionService,
    AuthService,
    AuditService,
    InvitationIssuer,
    InvitationsService,
    TeamService,
    RecoveryService,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
  exports: [
    Clock,
    EmailPort,
    PasswordService,
    SessionService,
    AuditService,
    InvitationIssuer,
  ],
})
export class IdentityModule {}
