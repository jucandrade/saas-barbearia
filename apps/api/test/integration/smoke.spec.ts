import { afterAll, describe, expect, it } from "vitest";
import {
  adminConnection,
  runtimeConnection,
  closeConnections,
} from "./helpers/db.js";
import { createBarbershop, createUser } from "./helpers/factory.js";

describe("integration harness", () => {
  afterAll(closeConnections);

  it("creates a barbershop and a user with the non-superuser owner", async () => {
    const { barbershopId } = await createBarbershop();
    const id = await createUser({ tenantId: barbershopId, role: "owner" });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("the owner is not a superuser and the API does not bypass RLS", async () => {
    const owner = await adminConnection().query(
      "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );
    expect(owner.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const api = await runtimeConnection().query(
      "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );
    expect(api.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});
