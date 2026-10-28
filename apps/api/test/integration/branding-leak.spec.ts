import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Branding, PublicIdentity } from "@barbearia/contracts";
import { eq } from "drizzle-orm";
import {
  barbershopBranding,
  barbershopLogo,
} from "../../src/db/schema/index.js";
import { createApp, type TestApp } from "./helpers/app.js";
import { createBrandingShop, type BrandingShop } from "./helpers/branding.js";
import { closeConnections, withTenantAdmin } from "./helpers/db.js";
import { jpeg, png } from "./helpers/images.js";

describe("branding: no leak between barbershops", () => {
  let t: TestApp;
  let a: BrandingShop;
  let b: BrandingShop;
  const logoA = png(200, 200);

  beforeAll(async () => {
    t = await createApp();
    a = await createBrandingShop(t, "Leak A");
    b = await createBrandingShop(t, "Leak B");
    await t.http().put("/branding").set(a.owner.auth).send({
      name: "Barbearia A",
      theme: "day",
      primaryTone: "blue",
      accentTone: "gold",
    });
    await t
      .http()
      .put("/branding/logo")
      .set(a.owner.auth)
      .set("Content-Type", "image/png")
      .send(logoA);
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  async function rowsOf(tenantId: string) {
    return withTenantAdmin(tenantId, async (tx) => ({
      branding: await tx
        .select()
        .from(barbershopBranding)
        .where(eq(barbershopBranding.tenantId, tenantId)),
      logo: await tx
        .select()
        .from(barbershopLogo)
        .where(eq(barbershopLogo.tenantId, tenantId)),
    }));
  }

  it("B reads its own identity, never A's", async () => {
    const response = await t.http().get("/branding").set(b.owner.auth);
    const branding = Branding.parse(response.body);
    expect(branding.name).toBe(b.name);
    expect(branding.customized).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain("Barbearia A");
  });

  it("writes by B never reach A's rows", async () => {
    const before = await rowsOf(a.tenantId);

    await t.http().put("/branding").set(b.owner.auth).send({
      name: "Barbearia B",
      theme: "leather",
      primaryTone: "wine",
      accentTone: "rose",
    });
    await t
      .http()
      .put("/branding/logo")
      .set(b.owner.auth)
      .set("Content-Type", "image/jpeg")
      .send(jpeg(300, 300));

    const after = await rowsOf(a.tenantId);
    expect(after.branding).toEqual(before.branding);
    expect(after.logo).toEqual(before.logo);
    expect(after.branding[0]).toMatchObject({
      theme: "day",
      primaryTone: "blue",
    });

    const readA = await t.http().get("/branding").set(a.owner.auth);
    expect(Branding.parse(readA.body).name).toBe("Barbearia A");
  });

  it("the public link of A serves only A, and the link of B only B", async () => {
    const identityA = PublicIdentity.parse(
      (await t.http().get(`/public/barbershops/${a.slug}/identity`)).body,
    );
    const identityB = PublicIdentity.parse(
      (await t.http().get(`/public/barbershops/${b.slug}/identity`)).body,
    );
    expect(identityA).toMatchObject({ name: "Barbearia A", theme: "day" });
    expect(identityB).toMatchObject({ name: "Barbearia B", theme: "leather" });

    const servedA = await t.http().get(identityA.logoUrl ?? "");
    expect(Buffer.from(servedA.body as Buffer).equals(logoA)).toBe(true);
  });

  it("a deactivated user loses the identity with the session (FR edge case)", async () => {
    const before = await t.http().get("/branding").set(a.barber.auth);
    expect(before.status).toBe(200);

    const deactivated = await t
      .http()
      .post(`/team/${a.barber.id}/deactivate`)
      .set(a.owner.auth);
    expect(deactivated.status).toBeLessThan(300);

    const after = await t.http().get("/branding").set(a.barber.auth);
    expect(after.status).toBe(401);
  });

  it("a session of A cannot be used to write B's identity", async () => {
    // There is no tenant in any path or body: the tenant is the session's.
    await t.http().put("/branding").set(a.owner.auth).send({
      name: "Still A",
      theme: "noir",
      primaryTone: "gold",
      accentTone: "gold",
    });
    const readB = await t.http().get("/branding").set(b.owner.auth);
    expect(Branding.parse(readB.body).name).toBe("Barbearia B");
  });
});
