import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  calculateTokenExpiration,
  normalizeEmail,
  tokenIsCurrent,
  validatePassword,
} from "@barbearia/domain";
import type { ResetInput } from "@barbearia/contracts";
import { ENV, type Env } from "../../config/config.module.js";
import { accessToken, user } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditService } from "../audit/audit.service.js";
import { SessionService } from "../auth/session.service.js";
import { Clock } from "../clock.js";
import { EmailPort } from "../email/email.port.js";
import { recoveryLink, recoveryTemplate } from "../email/templates.js";
import { ApiError } from "../http/api-error.js";
import { weakPassword } from "../invitations/invitations.service.js";
import { PasswordService } from "../security/password.service.js";
import { generateToken, hashToken } from "../security/tokens.js";

export const invalidToken = (): ApiError =>
  new ApiError(
    410,
    "INVALID_TOKEN",
    "Este link não é mais válido. Peça uma nova redefinição de senha.",
  );

/** Password recovery by a single-use, 1-hour link (FR-016). */
@Injectable()
export class RecoveryService {
  private readonly logger = new Logger("Recovery");

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly email: EmailPort,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Asks for a recovery link. It answers the same, and takes at least the same
   * time, whether or not the account exists (FR-014): the e-mail is sent without
   * being awaited and the response waits for a minimum floor.
   */
  async request(emailInput: string): Promise<void> {
    const started = performance.now();
    try {
      await this.issueFor(normalizeEmail(emailInput));
    } finally {
      const remaining =
        this.env.recoveryFloorMs - (performance.now() - started);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    }
  }

  private async issueFor(email: string): Promise<void> {
    const found = await this.tenantDb.withoutTenant().findUserByEmail(email);
    if (found?.status !== "active") {
      return;
    }

    const token = generateToken();
    const name = await this.tenantDb.transaction(found.tenantId, async (tx) => {
      const now = this.clock.now();
      await tx
        .update(accessToken)
        .set({ invalidatedAt: now })
        .where(
          and(
            eq(accessToken.userId, found.id),
            eq(accessToken.purpose, "recovery"),
            isNull(accessToken.usedAt),
            isNull(accessToken.invalidatedAt),
          ),
        );
      await tx.insert(accessToken).values({
        tenantId: found.tenantId,
        userId: found.id,
        purpose: "recovery",
        tokenHash: hashToken(token),
        createdAt: now,
        expiresAt: calculateTokenExpiration("recovery", now),
      });
      const [row] = await tx
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, found.id));
      await this.audit.record(tx, found.tenantId, {
        type: "password_recovery_requested",
        actorType: "user",
        actorUserId: found.id,
        targetUserId: found.id,
      });
      return row?.name ?? "";
    });

    void this.send(email, name, token);
  }

  /** Sends the e-mail after the commit; a failure is logged without personal data. */
  private async send(to: string, name: string, token: string): Promise<void> {
    try {
      await this.email.send({
        to,
        ...recoveryTemplate({
          name,
          link: recoveryLink(this.env.adminBaseUrl, token),
        }),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send recovery e-mail (${error instanceof Error ? error.constructor.name : "unknown"})`,
      );
    }
  }

  /** Sets the new password, ends every session and uses up the link. */
  async reset(input: ResetInput): Promise<void> {
    const found = await this.tenantDb
      .withoutTenant()
      .findAccessToken(hashToken(input.token), "recovery");
    if (found === undefined || !tokenIsCurrent(found, this.clock.now())) {
      throw invalidToken();
    }

    const target = await this.tenantDb.transaction(
      found.tenantId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(user)
          .where(eq(user.id, found.userId));
        return row;
      },
    );
    if (target?.status !== "active") {
      throw invalidToken();
    }

    const evaluation = validatePassword(input.password, {
      email: target.email,
      name: target.name,
    });
    if (!evaluation.valid) {
      throw weakPassword(evaluation.reason);
    }
    const passwordHash = await this.passwords.hash(input.password);

    await this.tenantDb.transaction(found.tenantId, async (tx) => {
      const now = this.clock.now();
      // Atomic single use: of two simultaneous resets, only one consumes the token.
      const consumed = await tx
        .update(accessToken)
        .set({ usedAt: now })
        .where(
          and(
            eq(accessToken.id, found.id),
            isNull(accessToken.usedAt),
            isNull(accessToken.invalidatedAt),
            gt(accessToken.expiresAt, now),
          ),
        )
        .returning({ id: accessToken.id });
      if (consumed.length === 0) {
        throw invalidToken();
      }
      const updated = await tx
        .update(user)
        .set({ passwordHash, failedAttempts: 0, lockedUntil: null })
        .where(and(eq(user.id, target.id), eq(user.status, "active")))
        .returning({ id: user.id });
      if (updated.length === 0) {
        throw invalidToken();
      }
      await this.sessions.revokeAll(tx, target.id);
      await this.audit.record(tx, target.tenantId, {
        type: "password_reset",
        actorType: "user",
        actorUserId: target.id,
        targetUserId: target.id,
      });
    });
  }
}
