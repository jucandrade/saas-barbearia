import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { normalizeEmail } from "@barbearia/domain";
import { accessToken, user } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditService } from "../audit/audit.service.js";
import { SessionService } from "../auth/session.service.js";
import { Clock } from "../clock.js";
import { PlatformError } from "./platform-error.js";

export const ANONYMIZED_NAME = "Usuário anonimizado";
export const anonymizedEmail = (id: string): string =>
  `anonymized-${id}@invalid`;

export interface AnonymizationResult {
  userId: string;
  /** `true` if it was already anonymized (the command is idempotent). */
  alreadyAnonymized: boolean;
}

/**
 * Anonymizes a user's personal data at the data subject's request (FR-024, LGPD).
 * Product-team command, no HTTP route. The record, the identifier and the
 * security events remain; name and e-mail disappear irreversibly.
 */
@Injectable()
export class AnonymizationService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async anonymize(input: { email: string }): Promise<AnonymizationResult> {
    const target = await this.tenantDb
      .withoutTenant()
      .findUserByEmail(normalizeEmail(input.email));
    if (target === undefined) {
      throw new PlatformError(
        "No user with this e-mail. If it was already anonymized, use the anonymized e-mail (anonymized-<id>@invalid).",
      );
    }
    if (target.status === "anonymized") {
      return { userId: target.id, alreadyAnonymized: true };
    }
    if (target.status !== "deactivated") {
      throw new PlatformError(
        "The user must be deactivated before being anonymized. Deactivate them first (the last active owner can be neither deactivated nor anonymized).",
      );
    }

    await this.tenantDb.transaction(target.tenantId, async (tx) => {
      const now = this.clock.now();
      await tx
        .update(user)
        .set({
          name: ANONYMIZED_NAME,
          email: anonymizedEmail(target.id),
          passwordHash: null,
          status: "anonymized",
          anonymizedAt: now,
          failedAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(user.id, target.id));
      await this.sessions.revokeAll(tx, target.id);
      await tx
        .update(accessToken)
        .set({ invalidatedAt: now })
        .where(
          and(
            eq(accessToken.userId, target.id),
            isNull(accessToken.usedAt),
            isNull(accessToken.invalidatedAt),
          ),
        );
      await this.audit.record(tx, target.tenantId, {
        type: "user_anonymized",
        actorType: "platform",
        targetUserId: target.id,
      });
    });
    return { userId: target.id, alreadyAnonymized: false };
  }
}
