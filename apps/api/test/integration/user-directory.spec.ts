import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TenantDb } from "../../src/db/tenant-db.js";
import { UserDirectory } from "../../src/identity/directory/user-directory.js";
import { ApiError } from "../../src/identity/http/api-error.js";
import { runtimeConnection, closeConnections } from "./helpers/db.js";
import { createBarbershop, createUser } from "./helpers/factory.js";

describe("UserDirectory", () => {
  let tenantDb: TenantDb;
  let directory: UserDirectory;
  let tenantId: string;
  let otherTenantId: string;
  let ownerId: string;
  let barberId: string;
  let invitedId: string;
  let deactivatedId: string;
  let anonymizedId: string;
  let outsiderId: string;

  beforeAll(async () => {
    tenantDb = new TenantDb(runtimeConnection());
    directory = new UserDirectory();
    ({ barbershopId: tenantId } = await createBarbershop("Directory A"));
    ({ barbershopId: otherTenantId } = await createBarbershop("Directory B"));
    ownerId = await createUser({ tenantId, role: "owner", name: "Dona Ana" });
    barberId = await createUser({ tenantId, role: "barber", name: "Bruno" });
    invitedId = await createUser({ tenantId, status: "invited" });
    deactivatedId = await createUser({ tenantId, status: "deactivated" });
    anonymizedId = await createUser({ tenantId, status: "anonymized" });
    outsiderId = await createUser({ tenantId: otherTenantId, role: "barber" });
  });

  afterAll(closeConnections);

  async function eligibilityOf(id: string): Promise<unknown> {
    return tenantDb
      .transaction(tenantId, (tx) => directory.assertEligibleExecutor(tx, id))
      .catch((error: unknown) => error);
  }

  it("finds users by id with name, role and status, only of the context's tenant", async () => {
    const found = await tenantDb.transaction(tenantId, (tx) =>
      directory.findByIds(tx, [ownerId, barberId, outsiderId]),
    );
    expect(found).toHaveLength(2);
    expect(found).toEqual(
      expect.arrayContaining([
        { id: ownerId, name: "Dona Ana", role: "owner", status: "active" },
        { id: barberId, name: "Bruno", role: "barber", status: "active" },
      ]),
    );
  });

  it("never exposes the e-mail", async () => {
    const found = await tenantDb.transaction(tenantId, (tx) =>
      directory.findByIds(tx, [ownerId]),
    );
    expect(Object.keys(found[0] ?? {}).sort()).toEqual([
      "id",
      "name",
      "role",
      "status",
    ]);
  });

  it("answers an empty list for no ids", async () => {
    const found = await tenantDb.transaction(tenantId, (tx) =>
      directory.findByIds(tx, []),
    );
    expect(found).toEqual([]);
  });

  it.each(["owner", "barber"] as const)(
    "accepts an active %s",
    async (kind) => {
      const id = kind === "owner" ? ownerId : barberId;
      await expect(eligibilityOf(id)).resolves.toMatchObject({ id });
    },
  );

  it.each([
    ["invited", () => invitedId],
    ["deactivated", () => deactivatedId],
    ["anonymized", () => anonymizedId],
  ])("refuses a %s user with EXECUTOR_NOT_ELIGIBLE", async (_status, id) => {
    const error = await eligibilityOf(id());
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "EXECUTOR_NOT_ELIGIBLE" });
    expect((error as ApiError).getStatus()).toBe(409);
  });

  it("answers 404 for a user of another barbershop and for an unknown id", async () => {
    for (const id of [outsiderId, "00000000-0000-4000-8000-000000000000"]) {
      const error = await eligibilityOf(id);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).getStatus()).toBe(404);
      expect(error).toMatchObject({ code: "NOT_FOUND" });
    }
  });
});
