import { Injectable } from "@nestjs/common";
import type { Transaction } from "../db/tenant-db.js";
import { catalogEvent, catalogEventType } from "../db/schema/index.js";

export type CatalogEventType = (typeof catalogEventType.enumValues)[number];

export interface NewCatalogEvent {
  type: CatalogEventType;
  actorUserId: string;
  serviceId?: string | null;
  categoryId?: string | null;
  targetUserId?: string | null;
  details?: Record<string, unknown>;
}

/** Keys that must never appear in an event's details (principle IX). */
const FORBIDDEN_KEYS = new Set([
  "email",
  "name",
  "password",
  "passwordhash",
  "token",
  "link",
  "ip",
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
          `A catalog event's details must not contain "${key}" (personal data or secret)`,
        );
      }
      verifyDetails(child);
    }
  }
}

/**
 * Writes the catalog audit trail (FR-014), inside the caller's transaction so the event is
 * born together with the operation. References records only by identifier.
 */
@Injectable()
export class CatalogAuditService {
  async record(
    tx: Transaction,
    tenantId: string,
    event: NewCatalogEvent,
  ): Promise<void> {
    verifyDetails(event.details);
    await tx.insert(catalogEvent).values({
      tenantId,
      type: event.type,
      actorUserId: event.actorUserId,
      serviceId: event.serviceId ?? null,
      categoryId: event.categoryId ?? null,
      targetUserId: event.targetUserId ?? null,
      details: event.details ?? {},
    });
  }
}
