import { Inject, Injectable } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { POOL, type Database, type Transaction } from "../../db/tenant-db.js";
import * as schema from "../../db/schema/index.js";
import { securityEvent, securityEventType } from "../../db/schema/index.js";

export type EventType = (typeof securityEventType.enumValues)[number];
export type ActorType = "user" | "platform" | "system";

export interface NewEvent {
  type: EventType;
  actorType: ActorType;
  actorUserId?: string | null;
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
          `A security event's details must not contain "${key}" (personal data or secret)`,
        );
      }
      verifyDetails(child);
    }
  }
}

/** Writes the audit trail (FR-020). References people only by internal identifier. */
@Injectable()
export class AuditService {
  private readonly database: Database;

  constructor(@Inject(POOL) pool: Pool) {
    this.database = drizzle(pool, { schema });
  }

  /** Inside the caller's transaction, so the event is born together with the operation. */
  async record(
    tx: Transaction,
    tenantId: string,
    event: NewEvent,
  ): Promise<void> {
    verifyDetails(event.details);
    await tx.insert(securityEvent).values({
      tenantId,
      type: event.type,
      actorType: event.actorType,
      actorUserId: event.actorUserId ?? null,
      targetUserId: event.targetUserId ?? null,
      details: event.details ?? {},
    });
  }

  /** Event without a barbershop (login failure for an unknown e-mail); no barbershop can see it. */
  async recordWithoutTenant(event: NewEvent): Promise<void> {
    verifyDetails(event.details);
    await this.database.insert(securityEvent).values({
      tenantId: null,
      type: event.type,
      actorType: event.actorType,
      actorUserId: event.actorUserId ?? null,
      targetUserId: event.targetUserId ?? null,
      details: event.details ?? {},
    });
  }
}
