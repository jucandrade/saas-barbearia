import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { normalizeEmail } from "@barbearia/domain";
import type { ProvisionBarbershopCommand } from "@barbearia/contracts";
import { pgCode, UNIQUE_VIOLATION } from "../../db/pg-errors.js";
import { barbershop, unit, user } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditService } from "../audit/audit.service.js";
import { InvitationIssuer } from "../invitations/invitation-issuer.js";
import { Clock } from "../clock.js";
import { EMAIL_UNAVAILABLE, PlatformError } from "./platform-error.js";

const VALID_TIMEZONES = new Set<string>([
  ...Intl.supportedValuesOf("timeZone"),
  "UTC",
]);

export interface ProvisioningResult {
  barbershopId: string;
  /** `false` if the invitation e-mail could not be sent (the barbershop was created anyway). */
  invitationSent: boolean;
}

/**
 * Provisions a barbershop: barbershop, initial unit and invited owner in a single
 * transaction (FR-001, FR-002). Product-team command, no HTTP route (FR-022).
 * Sets `app.tenant_id` with the generated UUID before any write, so it does not
 * rely on ignoring RLS (R2).
 */
@Injectable()
export class ProvisioningService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly issuer: InvitationIssuer,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async provision(
    data: ProvisionBarbershopCommand,
  ): Promise<ProvisioningResult> {
    if (!VALID_TIMEZONES.has(data.timezone)) {
      throw new PlatformError(`Unknown time zone: ${data.timezone}.`);
    }
    const email = normalizeEmail(data.ownerEmail);
    if (
      (await this.tenantDb.withoutTenant().findUserByEmail(email)) !== undefined
    ) {
      throw new PlatformError(EMAIL_UNAVAILABLE);
    }

    const barbershopId = randomUUID();
    const unitId = randomUUID();
    const userId = randomUUID();

    let token: string;
    try {
      token = await this.tenantDb.transaction(barbershopId, async (tx) => {
        await tx.insert(barbershop).values({
          id: barbershopId,
          name: data.name,
          createdAt: this.clock.now(),
        });
        await tx.insert(unit).values({
          id: unitId,
          tenantId: barbershopId,
          name: data.unit,
          timezone: data.timezone,
        });
        await tx.insert(user).values({
          id: userId,
          tenantId: barbershopId,
          name: data.ownerName,
          email,
          role: "owner",
          status: "invited",
        });
        const issued = await this.issuer.issue(tx, {
          tenantId: barbershopId,
          userId,
        });
        await this.audit.record(tx, barbershopId, {
          type: "barbershop_provisioned",
          actorType: "platform",
          targetUserId: userId,
          details: { role: "owner" },
        });
        await this.audit.record(tx, barbershopId, {
          type: "invitation_sent",
          actorType: "platform",
          targetUserId: userId,
          details: { role: "owner", origin: "provisioning" },
        });
        return issued;
      });
    } catch (error) {
      // Two simultaneous provisionings with the same e-mail: the unique index decides.
      if (pgCode(error) === UNIQUE_VIOLATION) {
        throw new PlatformError(EMAIL_UNAVAILABLE);
      }
      throw error;
    }

    const invitationSent = await this.issuer.send({
      to: email,
      name: data.ownerName,
      barbershop: data.name,
      token,
    });
    return { barbershopId, invitationSent };
  }
}
