import { readEnv } from "../../../src/config/env.js";
import { TenantDb } from "../../../src/db/tenant-db.js";
import { AuditService } from "../../../src/identity/audit/audit.service.js";
import { InvitationIssuer } from "../../../src/identity/invitations/invitation-issuer.js";
import { MemoryAdapter } from "../../../src/identity/email/memory.adapter.js";
import { ProvisioningService } from "../../../src/identity/provisioning/provisioning.service.js";
import { AnonymizationService } from "../../../src/identity/provisioning/anonymization.service.js";
import { OwnerInvitationResendService } from "../../../src/identity/provisioning/owner-invitation-resend.service.js";
import { SessionService } from "../../../src/identity/auth/session.service.js";
import { ControllableClock } from "../../../src/identity/clock.js";
import { ADMIN_ORIGIN } from "./app.js";
import { adminConnection } from "./db.js";

/**
 * The product-team services, wired to the admin connection of the test
 * database (`owner_test`, not a superuser): RLS applies to them too.
 */
export function createPlatformTools(overrides: { audit?: AuditService } = {}) {
  const pool = adminConnection();
  const tenantDb = new TenantDb(pool);
  const clock = new ControllableClock();
  const email = new MemoryAdapter();
  const env = readEnv({ ...process.env, ADMIN_BASE_URL: ADMIN_ORIGIN });
  const issuer = new InvitationIssuer(clock, email, env);
  const audit = overrides.audit ?? new AuditService(pool);
  const sessions = new SessionService(tenantDb, clock);
  return {
    tenantDb,
    clock,
    email,
    issuer,
    audit,
    provisioning: new ProvisioningService(tenantDb, issuer, audit, clock),
    resend: new OwnerInvitationResendService(tenantDb, issuer, audit),
    anonymization: new AnonymizationService(tenantDb, sessions, audit, clock),
  };
}

/** Extracts the token from the `…/invitation/<token>` link of an e-mail message. */
export function invitationTokenFrom(text: string): string {
  const match = /\/invitation\/([A-Za-z0-9_-]+)/.exec(text);
  if (match?.[1] === undefined) {
    throw new Error("the message has no invitation link");
  }
  return match[1];
}
