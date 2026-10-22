import { Controller, Get, Post } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Roles,
  Public,
  CurrentUser,
} from "../../src/identity/auth/decorators.js";
import type { AuthenticatedUser } from "../../src/identity/http/http-types.js";
import { createApp, ADMIN_ORIGIN, type TestApp } from "./helpers/app.js";
import { closeConnections } from "./helpers/db.js";
import { createBarbershop, createUser } from "./helpers/factory.js";

@Controller("test-guard")
class TestRoutes {
  @Public()
  @Get("public")
  public(): { ok: true } {
    return { ok: true };
  }

  @Get("protected")
  protected(
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): AuthenticatedUser | undefined {
    return user;
  }

  @Roles("owner")
  @Post("owner-only")
  ownerOnly(): { ok: true } {
    return { ok: true };
  }
}

describe("AuthGuard, OriginGuard and error filter", () => {
  let t: TestApp;
  let tenantId: string;
  let owner: string;
  let barber: string;

  beforeAll(async () => {
    t = await createApp({ controllers: [TestRoutes] });
    ({ barbershopId: tenantId } = await createBarbershop());
    owner = await createUser({ tenantId, role: "owner" });
    barber = await createUser({ tenantId, role: "barber" });
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("a public route needs no session, including /health", async () => {
    expect((await t.http().get("/test-guard/public")).status).toBe(200);
    expect((await t.http().get("/health")).status).toBe(200);
  });

  it("a protected route without a session answers 401 INVALID_SESSION", async () => {
    const r = await t.http().get("/test-guard/protected");
    expect(r.status).toBe(401);
    expect(r.body).toEqual({
      code: "INVALID_SESSION",
      message: "Sessão inválida ou expirada. Entre novamente.",
    });
  });

  it("accepts Bearer and injects user, role and barbershop", async () => {
    const token = await t.openSession({ id: owner, tenantId, role: "owner" });
    const r = await t
      .http()
      .get("/test-guard/protected")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ userId: owner, tenantId, role: "owner" });
  });

  it("accepts the session cookie", async () => {
    const token = await t.openSession({ id: owner, tenantId, role: "owner" });
    const r = await t
      .http()
      .get("/test-guard/protected")
      .set("Cookie", `session=${token}`);
    expect(r.status).toBe(200);
  });

  it("an invalid token or another format answers 401", async () => {
    expect(
      (
        await t
          .http()
          .get("/test-guard/protected")
          .set("Authorization", "Bearer lixo")
      ).status,
    ).toBe(401);
    expect(
      (
        await t
          .http()
          .get("/test-guard/protected")
          .set("Authorization", "Basic abc")
      ).status,
    ).toBe(401);
  });

  it("@Roles('owner'): a barber gets 403 NO_PERMISSION and an owner passes", async () => {
    const tokenBarber = await t.openSession({
      id: barber,
      tenantId,
      role: "barber",
    });
    const denied = await t
      .http()
      .post("/test-guard/owner-only")
      .set("Authorization", `Bearer ${tokenBarber}`);
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: "NO_PERMISSION" });

    const tokenOwner = await t.openSession({
      id: owner,
      tenantId,
      role: "owner",
    });
    expect(
      (
        await t
          .http()
          .post("/test-guard/owner-only")
          .set("Authorization", `Bearer ${tokenOwner}`)
      ).status,
    ).toBe(201);
  });

  it("with a cookie, a state-changing request requires the admin origin", async () => {
    const token = await t.openSession({ id: owner, tenantId, role: "owner" });
    const withoutOrigin = await t
      .http()
      .post("/test-guard/owner-only")
      .set("Cookie", `session=${token}`);
    expect(withoutOrigin.status).toBe(403);
    expect(withoutOrigin.body).toMatchObject({ code: "INVALID_ORIGIN" });

    const wrong = await t
      .http()
      .post("/test-guard/owner-only")
      .set("Cookie", `session=${token}`)
      .set("Origin", "http://evil.example");
    expect(wrong.status).toBe(403);

    const right = await t
      .http()
      .post("/test-guard/owner-only")
      .set("Cookie", `session=${token}`)
      .set("Origin", ADMIN_ORIGIN);
    expect(right.status).toBe(201);
  });

  it("Bearer does not depend on origin (mobile app)", async () => {
    const token = await t.openSession({ id: owner, tenantId, role: "owner" });
    const r = await t
      .http()
      .post("/test-guard/owner-only")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(201);
  });

  it("a nonexistent route answers 404 in the API error format, with or without a session", async () => {
    const expected = {
      code: "NOT_FOUND",
      message: "Recurso não encontrado.",
    };
    const anonymous = await t.http().get("/does-not-exist");
    expect(anonymous.status).toBe(404);
    expect(anonymous.body).toEqual(expected);
    const token = await t.openSession({ id: owner, tenantId, role: "owner" });
    const authenticated = await t
      .http()
      .get("/does-not-exist")
      .set("Authorization", `Bearer ${token}`);
    expect(authenticated.status).toBe(404);
    expect(authenticated.body).toEqual(expected);
  });
});
