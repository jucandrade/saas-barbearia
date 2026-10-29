import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TenantDb } from "../../src/db/tenant-db.js";
import { BarbershopDirectory } from "../../src/identity/directory/barbershop-directory.js";
import { runtimeConnection, closeConnections } from "./helpers/db.js";
import { createBarbershop } from "./helpers/factory.js";

describe("BarbershopDirectory", () => {
  let tenantDb: TenantDb;
  let directory: BarbershopDirectory;
  let a: { barbershopId: string; slug: string };
  let b: { barbershopId: string; slug: string };

  beforeAll(async () => {
    tenantDb = new TenantDb(runtimeConnection());
    directory = new BarbershopDirectory();
    a = await createBarbershop("Directory Shop A");
    b = await createBarbershop("Directory Shop B");
  });

  afterAll(closeConnections);

  it("returns id, name and public slug of the barbershop in context", async () => {
    const profile = await tenantDb.transaction(a.barbershopId, (tx) =>
      directory.getProfile(tx, a.barbershopId),
    );
    expect(profile).toEqual({
      id: a.barbershopId,
      name: "Directory Shop A",
      publicSlug: a.slug,
    });
  });

  it("renames only the barbershop in context", async () => {
    const renamed = await tenantDb.transaction(a.barbershopId, (tx) =>
      directory.rename(tx, a.barbershopId, "Renamed Shop A"),
    );
    expect(renamed).toBe("Renamed Shop A");

    const own = await tenantDb.transaction(a.barbershopId, (tx) =>
      directory.getProfile(tx, a.barbershopId),
    );
    const other = await tenantDb.transaction(b.barbershopId, (tx) =>
      directory.getProfile(tx, b.barbershopId),
    );
    expect(own.name).toBe("Renamed Shop A");
    expect(other.name).toBe("Directory Shop B");
  });

  it("cannot rename or read another barbershop even by passing its id", async () => {
    await expect(
      tenantDb.transaction(a.barbershopId, (tx) =>
        directory.rename(tx, b.barbershopId, "Hijacked"),
      ),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(
      tenantDb.transaction(a.barbershopId, (tx) =>
        directory.getProfile(tx, b.barbershopId),
      ),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    const untouched = await tenantDb.transaction(b.barbershopId, (tx) =>
      directory.getProfile(tx, b.barbershopId),
    );
    expect(untouched.name).toBe("Directory Shop B");
  });

  it("does not change the public slug when renaming", async () => {
    await tenantDb.transaction(a.barbershopId, (tx) =>
      directory.rename(tx, a.barbershopId, "Another Name Entirely"),
    );
    const profile = await tenantDb.transaction(a.barbershopId, (tx) =>
      directory.getProfile(tx, a.barbershopId),
    );
    expect(profile.publicSlug).toBe(a.slug);
  });
});
