import { asc } from "drizzle-orm";
import { catalogEvent } from "../../../src/db/schema/index.js";
import type { TestApp } from "./app.js";
import { newUuid, withTenantAdmin } from "./db.js";
import { createBarbershop, createUser } from "./factory.js";

export const NONEXISTENT = "00000000-0000-4000-8000-000000000000";

export interface Actor {
  id: string;
  auth: { Authorization: string };
}

export interface CatalogShop {
  tenantId: string;
  owner: Actor;
  barber: Actor;
}

let counter = 0;

/** A barbershop with an owner and a barber, both active and with an open session. */
export async function createCatalogShop(
  t: TestApp,
  name = "Catalog Shop",
): Promise<CatalogShop> {
  counter += 1;
  const { barbershopId: tenantId } = await createBarbershop(
    `${name} ${String(counter)}`,
  );
  async function actor(
    role: "owner" | "barber",
    label: string,
  ): Promise<Actor> {
    const id = await createUser({
      tenantId,
      name: label,
      email: `catalog-${role}-${newUuid()}@example.com`,
      role,
    });
    const token = await t.openSession({ id, tenantId, role });
    return { id, auth: { Authorization: `Bearer ${token}` } };
  }
  return {
    tenantId,
    owner: await actor("owner", "Dona Ana"),
    barber: await actor("barber", "Bruno Barbeiro"),
  };
}

/** Catalog events of the barbershop, oldest first. */
export const catalogEventsOf = (tenantId: string) =>
  withTenantAdmin(tenantId, (tx) =>
    tx.select().from(catalogEvent).orderBy(asc(catalogEvent.occurredAt)),
  );
