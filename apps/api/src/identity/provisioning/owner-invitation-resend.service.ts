import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { normalizeEmail } from "@barbearia/domain";
import { pgCode, UNIQUE_VIOLATION } from "../../db/pg-errors.js";
import { barbershop, user } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditService } from "../audit/audit.service.js";
import { InvitationIssuer } from "../invitations/invitation-issuer.js";
import { EMAIL_UNAVAILABLE, PlatformError } from "./platform-error.js";

/**
 * Resends the first owner's invitation; the owner cannot sign in yet and so
 * has no way to ask for a new one (FR-009). Product-team command, no HTTP route.
 */
@Injectable()
export class OwnerInvitationResendService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly issuer: InvitationIssuer,
    private readonly audit: AuditService,
  ) {}

  async resend(input: {
    email: string;
    newEmail?: string;
  }): Promise<{ invitationSent: boolean }> {
    const current = normalizeEmail(input.email);
    const target = await this.tenantDb.withoutTenant().findUserByEmail(current);
    if (target?.role !== "owner" || target.status !== "invited") {
      throw new PlatformError(
        "There is no owner with a pending invitation for this e-mail.",
      );
    }

    const destination =
      input.newEmail === undefined ? current : normalizeEmail(input.newEmail);
    if (
      destination !== current &&
      (await this.tenantDb.withoutTenant().findUserByEmail(destination)) !==
        undefined
    ) {
      throw new PlatformError(EMAIL_UNAVAILABLE);
    }

    let result: { token: string; name: string; barbershopName: string };
    try {
      result = await this.tenantDb.transaction(target.tenantId, async (tx) => {
        if (destination !== current) {
          await tx
            .update(user)
            .set({ email: destination })
            .where(eq(user.id, target.id));
        }
        const [owner] = await tx
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, target.id));
        const [shop] = await tx
          .select({ name: barbershop.name })
          .from(barbershop);
        const token = await this.issuer.issue(tx, {
          tenantId: target.tenantId,
          userId: target.id,
        });
        await this.audit.record(tx, target.tenantId, {
          type: "invitation_sent",
          actorType: "platform",
          targetUserId: target.id,
          details: { role: "owner", origin: "resend" },
        });
        return {
          token,
          name: owner?.name ?? "",
          barbershopName: shop?.name ?? "",
        };
      });
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) {
        throw new PlatformError(EMAIL_UNAVAILABLE);
      }
      throw error;
    }

    const invitationSent = await this.issuer.send({
      to: destination,
      name: result.name,
      barbershop: result.barbershopName,
      token: result.token,
    });
    return { invitationSent };
  }
}
