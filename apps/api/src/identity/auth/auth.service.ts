import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  evaluateLoginAttempt,
  normalizeEmail,
  recordLoginFailure,
  recordLoginSuccess,
} from "@barbearia/domain";
import type { LoginInput, User } from "@barbearia/contracts";
import { user } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditService } from "../audit/audit.service.js";
import { ApiError } from "../http/api-error.js";
import { Clock } from "../clock.js";
import { PasswordService } from "../security/password.service.js";
import { SessionService } from "./session.service.js";

/** The same response for any failure reason, so it never reveals whether the account exists (FR-014). */
export const invalidCredentials = (): ApiError =>
  new ApiError(
    401,
    "INVALID_CREDENTIALS",
    "E-mail ou senha incorretos, ou acesso temporariamente bloqueado.",
  );

type LoginResult =
  { success: false } | { success: true; token: string; user: User };

@Injectable()
export class AuthService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async login(input: LoginInput): Promise<{ user: User; token: string }> {
    const match = await this.tenantDb
      .withoutTenant()
      .findUserByEmail(normalizeEmail(input.email));

    if (match === undefined) {
      // Spends the time of a real verification: the response does not give away an unknown e-mail.
      await this.passwords.verifyDummyPassword(input.password);
      await this.audit.recordWithoutTenant({
        type: "login_failure",
        actorType: "system",
        details: { reason: "account_not_found" },
      });
      throw invalidCredentials();
    }

    const result: LoginResult = await this.tenantDb.transaction(
      match.tenantId,
      async (tx) => {
        // Locks the account while verifying: simultaneous attempts are counted one at a time.
        const [account] = await tx
          .select()
          .from(user)
          .where(eq(user.id, match.id))
          .for("update");
        if (account === undefined) {
          return { success: false };
        }
        const now = this.clock.now();
        const evaluation = evaluateLoginAttempt(
          {
            failedAttempts: account.failedAttempts,
            lockedUntil: account.lockedUntil,
          },
          now,
        );
        const recordFailure = (reason: string) =>
          this.audit.record(tx, account.tenantId, {
            type: "login_failure",
            actorType: "user",
            actorUserId: account.id,
            targetUserId: account.id,
            details: { reason },
          });

        if (evaluation.locked) {
          await this.passwords.verifyDummyPassword(input.password);
          await recordFailure("account_locked");
          return { success: false };
        }

        const passwordCorrect =
          account.passwordHash === null
            ? await this.passwords.verifyDummyPassword(input.password)
            : await this.passwords.verify(account.passwordHash, input.password);

        if (!passwordCorrect || account.status !== "active") {
          const next = recordLoginFailure(evaluation.state, now);
          await tx
            .update(user)
            .set({
              failedAttempts: next.failedAttempts,
              lockedUntil: next.lockedUntil,
            })
            .where(eq(user.id, account.id));
          await recordFailure(
            passwordCorrect ? "account_inactive" : "wrong_password",
          );
          return { success: false };
        }

        const clean = recordLoginSuccess();
        await tx
          .update(user)
          .set({
            failedAttempts: clean.failedAttempts,
            lockedUntil: clean.lockedUntil,
          })
          .where(eq(user.id, account.id));
        const token = await this.sessions.start(tx, {
          id: account.id,
          tenantId: account.tenantId,
          role: account.role,
        });
        await this.audit.record(tx, account.tenantId, {
          type: "login_success",
          actorType: "user",
          actorUserId: account.id,
          targetUserId: account.id,
          details: { role: account.role },
        });
        return {
          success: true,
          token,
          user: {
            id: account.id,
            name: account.name,
            email: account.email,
            role: account.role,
            status: "active",
            barbershopId: account.tenantId,
          },
        };
      },
    );

    if (!result.success) {
      throw invalidCredentials();
    }
    return { user: result.user, token: result.token };
  }

  async logout(session: {
    tenantId: string;
    sessionId: string;
    userId: string;
  }): Promise<void> {
    await this.tenantDb.transaction(session.tenantId, async (tx) => {
      await this.sessions.revoke(tx, session.sessionId);
      await this.audit.record(tx, session.tenantId, {
        type: "logout",
        actorType: "user",
        actorUserId: session.userId,
        targetUserId: session.userId,
      });
    });
  }
}
