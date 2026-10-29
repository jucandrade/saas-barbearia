import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { normalizeEmail, slugify, withSuffix } from "@barbearia/domain";
import type { ProvisionBarbershopCommand } from "@barbearia/contracts";
import { pgCode, pgConstraint, UNIQUE_VIOLATION } from "../../db/pg-errors.js";
import { barbershop, unit, user } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditService } from "../audit/audit.service.js";
import { InvitationIssuer } from "../invitations/invitation-issuer.js";
import { Clock } from "../clock.js";
import { EMAIL_UNAVAILABLE, PlatformError } from "./platform-error.js";

/** Constraint behind the public link identifier of a barbershop (R2). */
const PUBLIC_SLUG_CONSTRAINT = "barbershops_public_slug";
/** Attempts to find a free public slug before giving up (names are not expected to collide this often). */
const MAX_SLUG_ATTEMPTS = 25;

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

    // The public link comes from the name; a taken one gets "-2", "-3"... A concurrent provisioning
    // of the same name loses at the unique constraint and simply tries the next suffix.
    const baseSlug = slugify(data.name);
    let token: string | undefined;
    for (let attempt = 1; token === undefined; attempt += 1) {
      const publicSlug =
        attempt === 1 ? baseSlug : withSuffix(baseSlug, attempt);
      try {
        token = await this.provisionOnce(
          { barbershopId, unitId, userId, publicSlug },
          data,
          email,
        );
      } catch (error) {
        if (pgCode(error) !== UNIQUE_VIOLATION) {
          throw error;
        }
        if (pgConstraint(error) !== PUBLIC_SLUG_CONSTRAINT) {
          // Two simultaneous provisionings with the same e-mail: the unique index decides.
          throw new PlatformError(EMAIL_UNAVAILABLE);
        }
        if (attempt >= MAX_SLUG_ATTEMPTS) {
          throw error;
        }
      }
    }

    const invitationSent = await this.issuer.send({
      to: email,
      name: data.ownerName,
      barbershop: data.name,
      token,
    });
    return { barbershopId, invitationSent };
  }

  /** One attempt of the provisioning transaction; throws on a unique violation so the caller can decide. */
  private provisionOnce(
    ids: {
      barbershopId: string;
      unitId: string;
      userId: string;
      publicSlug: string;
    },
    data: ProvisionBarbershopCommand,
    email: string,
  ): Promise<string> {
    const { barbershopId, unitId, userId, publicSlug } = ids;
    return this.tenantDb.transaction(barbershopId, async (tx) => {
      await tx.insert(barbershop).values({
        id: barbershopId,
        name: data.name,
        publicSlug,
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
  }
}
