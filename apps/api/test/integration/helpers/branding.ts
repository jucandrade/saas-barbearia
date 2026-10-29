import { desc } from "drizzle-orm";
import { brandingEvent } from "../../../src/db/schema/index.js";
import type { TestApp } from "./app.js";
import { newUuid, withTenantAdmin } from "./db.js";
import { createBarbershop, createUser } from "./factory.js";

export interface Actor {
  id: string;
  auth: { Authorization: string };
}

export interface BrandingShop {
  tenantId: string;
  slug: string;
  name: string;
  owner: Actor;
  barber: Actor;
}

let counter = 0;

/** A barbershop with an owner and a barber, both active and with an open session. */
export async function createBrandingShop(
  t: TestApp,
  name = "Branding Shop",
): Promise<BrandingShop> {
  counter += 1;
  const fullName = `${name} ${String(counter)}`;
  const { barbershopId: tenantId, slug } = await createBarbershop(fullName);
  async function actor(role: "owner" | "barber"): Promise<Actor> {
    const id = await createUser({
      tenantId,
      name: role === "owner" ? "Dona Ana" : "Bruno Barbeiro",
      email: `branding-${role}-${newUuid()}@example.com`,
      role,
    });
    const token = await t.openSession({ id, tenantId, role });
    return { id, auth: { Authorization: `Bearer ${token}` } };
  }
  return {
    tenantId,
    slug,
    name: fullName,
    owner: await actor("owner"),
    barber: await actor("barber"),
  };
}

/** Branding events of the tenant, newest first. */
export async function brandingEventsOf(tenantId: string) {
  return withTenantAdmin(tenantId, (tx) =>
    tx.select().from(brandingEvent).orderBy(desc(brandingEvent.occurredAt)),
  );
}
