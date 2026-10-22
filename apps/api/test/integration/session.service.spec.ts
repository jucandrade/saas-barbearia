import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { session, user } from "../../src/db/schema/index.js";
import { TenantDb } from "../../src/db/tenant-db.js";
import { SessionService } from "../../src/identity/auth/session.service.js";
import { ControllableClock } from "../../src/identity/clock.js";
import { hashToken } from "../../src/identity/security/tokens.js";
import { runtimeConnection, closeConnections } from "./helpers/db.js";
import { createBarbershop, createUser } from "./helpers/factory.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("SessionService", () => {
  let tenantDb: TenantDb;
  let clock: ControllableClock;
  let service: SessionService;
  let tenantId: string;

  beforeAll(async () => {
    tenantDb = new TenantDb(runtimeConnection());
    ({ barbershopId: tenantId } = await createBarbershop());
  });

  afterAll(closeConnections);

  async function open(role: "owner" | "barber") {
    clock = new ControllableClock();
    service = new SessionService(tenantDb, clock);
    const id = await createUser({ tenantId, role, status: "active" });
    const token = await tenantDb.transaction(tenantId, (tx) =>
      service.start(tx, { id, tenantId, role }),
    );
    return { id, token };
  }

  it("starts the session storing only the hash and resolves the token", async () => {
    const { id, token } = await open("owner");
    const rows = await tenantDb.transaction(tenantId, (tx) =>
      tx.select().from(session),
    );
    const own = rows.find((l) => l.userId === id);
    expect(own?.tokenHash.equals(hashToken(token))).toBe(true);
    expect(own?.tokenHash.toString("base64url")).not.toBe(token);

    expect(await service.resolve(token)).toMatchObject({
      userId: id,
      tenantId,
      role: "owner",
    });
  });

  it("an unknown token does not resolve", async () => {
    await open("owner");
    expect(await service.resolve("token-that-does-not-exist")).toBeUndefined();
  });

  it("the owner's session expires after 12 hours of inactivity", async () => {
    const { token } = await open("owner");
    clock.advance(12 * HOUR - 1000);
    expect(await service.resolve(token)).toBeDefined();
    clock.advance(12 * HOUR + 1000);
    expect(await service.resolve(token)).toBeUndefined();
  });

  it("the barber's lasts 30 days of inactivity", async () => {
    const { token } = await open("barber");
    clock.advance(29 * DAY);
    expect(await service.resolve(token)).toBeDefined();
    clock.advance(31 * DAY);
    expect(await service.resolve(token)).toBeUndefined();
  });

  it("use renews the expiration (sliding inactivity)", async () => {
    const { token } = await open("owner");
    clock.advance(11 * HOUR);
    expect(await service.resolve(token)).toBeDefined();
    clock.advance(11 * HOUR);
    expect(await service.resolve(token)).toBeDefined();
  });

  it("revoking takes effect on the next request", async () => {
    const { token } = await open("owner");
    const sessionResolved = await service.resolve(token);
    await tenantDb.transaction(tenantId, (tx) =>
      service.revoke(tx, sessionResolved?.sessionId ?? ""),
    );
    expect(await service.resolve(token)).toBeUndefined();
  });

  it("revokeAll ends all of the user's sessions", async () => {
    const { id, token } = await open("barber");
    const second = await tenantDb.transaction(tenantId, (tx) =>
      service.start(tx, { id, tenantId, role: "barber" }),
    );
    await tenantDb.transaction(tenantId, (tx) => service.revokeAll(tx, id));
    expect(await service.resolve(token)).toBeUndefined();
    expect(await service.resolve(second)).toBeUndefined();
  });

  it("a user who stopped being active does not resolve, even with a current session", async () => {
    const { id, token } = await open("barber");
    await tenantDb.transaction(tenantId, (tx) =>
      tx.update(user).set({ status: "deactivated" }).where(eq(user.id, id)),
    );
    expect(await service.resolve(token)).toBeUndefined();
  });
});
