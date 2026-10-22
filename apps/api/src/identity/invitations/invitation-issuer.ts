import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { calculateTokenExpiration } from "@barbearia/domain";
import { ENV, type Env } from "../../config/config.module.js";
import { accessToken } from "../../db/schema/index.js";
import type { Transaction } from "../../db/tenant-db.js";
import { EmailPort } from "../email/email.port.js";
import { invitationLink, invitationTemplate } from "../email/templates.js";
import { Clock } from "../clock.js";
import { generateToken, hashToken } from "../security/tokens.js";

/**
 * Issues and sends first-access invitations (R6, R7). Issuing happens inside the
 * caller's transaction; sending happens after the commit, and a sending failure
 * does not undo the invitation: the owner (or the product team) can resend it.
 */
@Injectable()
export class InvitationIssuer {
  private readonly logger = new Logger("Invitations");

  constructor(
    private readonly clock: Clock,
    private readonly email: EmailPort,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Invalidates the previous pending invitation and creates another, valid for 7 days. Returns the plain token. */
  async issue(
    tx: Transaction,
    target: { tenantId: string; userId: string },
  ): Promise<string> {
    const now = this.clock.now();
    await tx
      .update(accessToken)
      .set({ invalidatedAt: now })
      .where(
        and(
          eq(accessToken.userId, target.userId),
          eq(accessToken.purpose, "invitation"),
          isNull(accessToken.usedAt),
          isNull(accessToken.invalidatedAt),
        ),
      );
    const token = generateToken();
    await tx.insert(accessToken).values({
      tenantId: target.tenantId,
      userId: target.userId,
      purpose: "invitation",
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt: calculateTokenExpiration("invitation", now),
    });
    return token;
  }

  /** Sends the invitation e-mail; `false` if sending fails (the invitation stays valid). */
  async send(data: {
    to: string;
    name: string;
    barbershop: string;
    token: string;
  }): Promise<boolean> {
    try {
      await this.email.send({
        to: data.to,
        ...invitationTemplate({
          name: data.name,
          barbershop: data.barbershop,
          link: invitationLink(this.env.adminBaseUrl, data.token),
        }),
      });
      return true;
    } catch (error) {
      // Only the error type: the transport message may carry the recipient.
      this.logger.warn(
        `Failed to send invitation e-mail (${error instanceof Error ? error.constructor.name : "unknown"})`,
      );
      return false;
    }
  }
}
