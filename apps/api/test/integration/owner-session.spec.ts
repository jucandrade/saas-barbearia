import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PasswordService } from "../../src/identity/security/password.service.js";
import { createApp, type TestApp } from "./helpers/app.js";
import { closeConnections } from "./helpers/db.js";
import { createBarbershop, createUser } from "./helpers/factory.js";

const PASSWORD = "Senha-Longa-De-Teste-2026";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Protects the session rule of feature 002 that FR-022 reuses for the owner in the app:
 * 12 hours without use for the owner (panel and app alike), 30 days for the barber.
 * It must pass without any code change in this feature.
 */
describe("session duration by role (FR-022)", () => {
  let t: TestApp;
  let hash: string;
  let counter = 0;

  beforeAll(async () => {
    t = await createApp();
    hash = await t.app.get(PasswordService).hash(PASSWORD);
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  async function account(role: "owner" | "barber") {
    counter += 1;
    const { barbershopId: tenantId } = await createBarbershop(
      `Session ${String(counter)}`,
    );
    const email = `session-${String(counter)}@example.com`;
    await createUser({ tenantId, email, role, passwordHash: hash });
    return email;
  }

  async function bearerFor(
    email: string,
    client: "web" | "mobile",
  ): Promise<Record<string, string>> {
    const login = await t
      .http()
      .post("/auth/login")
      .send({ email, password: PASSWORD, client });
    expect(login.status).toBe(200);
    if (client === "mobile") {
      return {
        Authorization: `Bearer ${(login.body as { token: string }).token}`,
      };
    }
    const cookie =
      (login.headers["set-cookie"] as unknown as string[])[0] ?? "";
    return { Cookie: cookie.split(";")[0] ?? "" };
  }

  const me = (headers: Record<string, string>) =>
    t.http().get("/auth/me").set(headers);

  it.each(["mobile", "web"] as const)(
    "the owner session in the %s client lasts 12 hours without use",
    async (client) => {
      const headers = await bearerFor(await account("owner"), client);
      t.clock.advance(12 * HOUR - 1000);
      expect((await me(headers)).status).toBe(200);
    },
  );

  it.each(["mobile", "web"] as const)(
    "the owner session in the %s client is gone after 12 hours without use",
    async (client) => {
      const headers = await bearerFor(await account("owner"), client);
      t.clock.advance(12 * HOUR + 1000);
      const response = await me(headers);
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: "INVALID_SESSION" });
    },
  );

  it("the barber session keeps its 30 days", async () => {
    const email = await account("barber");
    const stillOpen = await bearerFor(email, "mobile");
    t.clock.advance(29 * DAY);
    expect((await me(stillOpen)).status).toBe(200);

    const gone = await bearerFor(await account("barber"), "mobile");
    t.clock.advance(31 * DAY);
    expect((await me(gone)).status).toBe(401);
  });
});
