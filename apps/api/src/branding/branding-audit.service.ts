import { Injectable } from "@nestjs/common";
import type { Transaction } from "../db/tenant-db.js";
import { brandingEvent, brandingEventType } from "../db/schema/index.js";

export type BrandingEventType = (typeof brandingEventType.enumValues)[number];

export interface NewBrandingEvent {
  type: BrandingEventType;
  actorUserId: string;
  details?: Record<string, unknown>;
}

/**
 * Keys that must never appear in an event's details: personal data, secrets and, specific to
 * this context, the logo itself or anything that names its file (principle IX, FR-014).
 */
const FORBIDDEN_KEYS = new Set([
  "email",
  "name",
  "password",
  "passwordhash",
  "token",
  "link",
  "ip",
  "content",
  "logo",
  "bytes",
  "filename",
]);

function verifyDetails(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(verifyDetails);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        throw new Error(
          `A branding event's details must not contain "${key}" (personal data, secret or logo content)`,
        );
      }
      verifyDetails(child);
    }
  }
}

/**
 * Writes the visual identity audit trail (FR-014), inside the caller's transaction so the
 * event is born together with the operation. Holds only field names and closed values.
 */
@Injectable()
export class BrandingAuditService {
  async record(
    tx: Transaction,
    tenantId: string,
    event: NewBrandingEvent,
  ): Promise<void> {
    verifyDetails(event.details);
    await tx.insert(brandingEvent).values({
      tenantId,
      type: event.type,
      actorUserId: event.actorUserId,
      details: event.details ?? {},
    });
  }
}
