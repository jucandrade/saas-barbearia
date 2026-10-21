import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import {
  calculateExpiration,
  sessionIsCurrent,
  type Role,
} from "@barbearia/domain";
import { session } from "../../db/schema/index.js";
import { TenantDb, type Transaction } from "../../db/tenant-db.js";
import { Clock } from "../clock.js";
import { generateToken, hashToken } from "../security/tokens.js";

/** A session renews its last use at most once a minute (R4). */
const INTERVAL_RENEWAL_MS = 60_000;

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  tenantId: string;
  role: Role;
}

/** Opaque server-side session; revoking takes effect on the next request (SC-004). */
@Injectable()
export class SessionService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly clock: Clock,
  ) {}

  /** Creates the session and returns the token, which only exists now: the database keeps the hash. */
  async start(
    tx: Transaction,
    user: { id: string; tenantId: string; role: Role },
  ): Promise<string> {
    const now = this.clock.now();
    const token = generateToken();
    await tx.insert(session).values({
      tenantId: user.tenantId,
      userId: user.id,
      tokenHash: hashToken(token),
      createdAt: now,
      lastUsedAt: now,
      expiresAt: calculateExpiration(user.role, now),
    });
    return token;
  }

  /** Resolves the token into user, role and tenant; `undefined` if the session is not valid. */
  async resolve(token: string): Promise<AuthenticatedSession | undefined> {
    const found = await this.tenantDb
      .withoutTenant()
      .findSession(hashToken(token));
    if (found === undefined) {
      return undefined;
    }
    const now = this.clock.now();
    const current = sessionIsCurrent(
      { expiresAt: found.expiresAt, revokedAt: found.revokedAt },
      now,
    );
    if (!current || found.status !== "active") {
      return undefined;
    }
    if (now.getTime() - found.lastUsedAt.getTime() >= INTERVAL_RENEWAL_MS) {
      await this.tenantDb.transaction(found.tenantId, (tx) =>
        tx
          .update(session)
          .set({
            lastUsedAt: now,
            expiresAt: calculateExpiration(found.role, now),
          })
          .where(eq(session.id, found.sessionId)),
      );
    }
    return {
      sessionId: found.sessionId,
      userId: found.userId,
      tenantId: found.tenantId,
      role: found.role,
    };
  }

  async revoke(tx: Transaction, sessionId: string): Promise<void> {
    await tx
      .update(session)
      .set({ revokedAt: this.clock.now() })
      .where(and(eq(session.id, sessionId), isNull(session.revokedAt)));
  }

  /** Ends all of the user's open sessions (deactivate, change password). */
  async revokeAll(tx: Transaction, userId: string): Promise<void> {
    await tx
      .update(session)
      .set({ revokedAt: this.clock.now() })
      .where(and(eq(session.userId, userId), isNull(session.revokedAt)));
  }
}
