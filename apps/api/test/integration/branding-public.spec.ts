import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PublicIdentity } from "@barbearia/contracts";
import { createApp, type TestApp } from "./helpers/app.js";
import { createBrandingShop, type BrandingShop } from "./helpers/branding.js";
import { closeConnections } from "./helpers/db.js";
import { jpeg, png } from "./helpers/images.js";

const DEFAULT_IDENTITY = {
  name: null,
  theme: "noir",
  primaryTone: "gold",
  accentTone: "gold",
  logoUrl: null,
};

describe("public identity (no login)", () => {
  let t: TestApp;
  let custom: BrandingShop;
  let other: BrandingShop;
  let plain: BrandingShop;
  const logo = png(200, 200);

  beforeAll(async () => {
    t = await createApp();
    custom = await createBrandingShop(t, "Public Custom");
    other = await createBrandingShop(t, "Public Other");
    plain = await createBrandingShop(t, "Public Plain");

    await t.http().put("/branding").set(custom.owner.auth).send({
      name: "Billy Barbearia",
      theme: "day",
      primaryTone: "blue",
      accentTone: "gold",
    });
    await t
      .http()
      .put("/branding/logo")
      .set(custom.owner.auth)
      .set("Content-Type", "image/png")
      .send(logo);
    await t.http().put("/branding").set(other.owner.auth).send({
      name: "Outra Barbearia",
      theme: "leather",
      primaryTone: "sage",
      accentTone: "wine",
    });
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  const identityOf = (slug: string) =>
    t.http().get(`/public/barbershops/${slug}/identity`);

  it("returns exactly the identity fields, without a session", async () => {
    const response = await identityOf(custom.slug);
    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual([
      "accentTone",
      "logoUrl",
      "name",
      "primaryTone",
      "theme",
    ]);
    const identity = PublicIdentity.parse(response.body);
    expect(identity).toMatchObject({
      name: "Billy Barbearia",
      theme: "day",
      primaryTone: "blue",
      accentTone: "gold",
    });
    expect(identity.logoUrl).toMatch(
      new RegExp(`^/public/barbershops/${custom.slug}/logo\\?v=[0-9a-f]{16}$`),
    );
  });

  it("ignores an invalid cookie or token", async () => {
    const withCookie = await identityOf(custom.slug).set(
      "Cookie",
      "session=garbage",
    );
    const withToken = await identityOf(custom.slug).set(
      "Authorization",
      "Bearer garbage",
    );
    expect(withCookie.status).toBe(200);
    expect(withToken.status).toBe(200);
  });

  it("returns the product default, with the registered name, for a barbershop never customized", async () => {
    const response = await identityOf(plain.slug);
    expect(response.status).toBe(200);
    expect(PublicIdentity.parse(response.body)).toEqual({
      ...DEFAULT_IDENTITY,
      name: plain.name,
    });
  });

  it("each barbershop link reaches only its own identity", async () => {
    const a = await identityOf(custom.slug);
    const b = await identityOf(other.slug);
    expect(PublicIdentity.parse(a.body).name).toBe("Billy Barbearia");
    expect(PublicIdentity.parse(b.body)).toMatchObject({
      name: "Outra Barbearia",
      theme: "leather",
    });
    expect(JSON.stringify(a.body)).not.toContain("Outra");
    expect(JSON.stringify(b.body)).not.toContain("Billy");
  });

  describe("unknown links are indistinguishable from a barbershop without customization", () => {
    it.each([
      ["a well formed slug that does not exist", "nao-existe-mesmo"],
      ["an uppercase and underscore slug", "A_B"],
      ["a 60-character slug", "a".repeat(60)],
      ["a path traversal attempt", "..%2Fetc"],
      ["a two-character slug", "ab"],
    ])("%s", async (_name, slug) => {
      const unknown = await identityOf(slug);
      const known = await identityOf(plain.slug);
      expect(unknown.status).toBe(200);
      expect(PublicIdentity.parse(unknown.body)).toEqual(DEFAULT_IDENTITY);
      // Same shape and same headers: nothing tells "no such link" from "no customization".
      expect(Object.keys(unknown.headers).sort()).toEqual(
        Object.keys(known.headers).sort(),
      );
      expect(unknown.headers["cache-control"]).toBe(
        known.headers["cache-control"],
      );
      expect(unknown.headers["content-type"]).toBe(
        known.headers["content-type"],
      );
      expect(Object.keys(unknown.body as object).sort()).toEqual(
        Object.keys(known.body as object).sort(),
      );
    });

    it.todo(
      "a deactivated barbershop answers like an unknown slug (FR-030) - barbershops cannot be deactivated yet; the feature that introduces it must update public_get_identity and public_get_logo",
    );
  });

  it("revalidates with an ETag and answers 304 when nothing changed", async () => {
    const first = await identityOf(custom.slug);
    const etag = first.headers["etag"];
    expect(etag).toEqual(expect.any(String));
    expect(first.headers["cache-control"]).toBe("no-cache");

    const second = await identityOf(custom.slug).set(
      "If-None-Match",
      etag ?? "",
    );
    expect(second.status).toBe(304);

    await t.http().put("/branding").set(custom.owner.auth).send({
      name: "Billy Barbearia",
      theme: "noir",
      primaryTone: "blue",
      accentTone: "gold",
    });
    const third = await identityOf(custom.slug).set(
      "If-None-Match",
      etag ?? "",
    );
    expect(third.status).toBe(200);
    expect(PublicIdentity.parse(third.body).theme).toBe("noir");
  });

  describe("the logo", () => {
    it("serves the bytes with the detected type and the safety headers", async () => {
      const identity = PublicIdentity.parse(
        (await identityOf(custom.slug)).body,
      );
      const response = await t.http().get(identity.logoUrl ?? "");
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/^image\/png/);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["content-security-policy"]).toBe(
        "default-src 'none'; sandbox",
      );
      expect(response.headers["content-disposition"]).toBe("inline");
      expect(response.headers["cache-control"]).toBe(
        "public, max-age=31536000, immutable",
      );
      expect(response.headers["etag"]).toEqual(expect.any(String));
      expect(Buffer.from(response.body as Buffer).equals(logo)).toBe(true);
    });

    it("answers 404 identically for an unknown link and for a barbershop without a logo", async () => {
      const unknown = await t
        .http()
        .get("/public/barbershops/nao-existe-mesmo/logo");
      const noLogo = await t
        .http()
        .get(`/public/barbershops/${plain.slug}/logo`);
      expect(unknown.status).toBe(404);
      expect(noLogo.status).toBe(404);
      expect(unknown.body).toEqual(noLogo.body);
      expect(Object.keys(unknown.headers).sort()).toEqual(
        Object.keys(noLogo.headers).sort(),
      );
    });

    it("a new logo changes the version in the url and is what the link serves", async () => {
      const before = PublicIdentity.parse((await identityOf(other.slug)).body);
      expect(before.logoUrl).toBeNull();

      const newLogo = jpeg(300, 150);
      await t
        .http()
        .put("/branding/logo")
        .set(other.owner.auth)
        .set("Content-Type", "image/jpeg")
        .send(newLogo);
      const after = PublicIdentity.parse((await identityOf(other.slug)).body);
      expect(after.logoUrl).toMatch(/\?v=[0-9a-f]{16}$/);

      const served = await t.http().get(after.logoUrl ?? "");
      expect(served.headers["content-type"]).toMatch(/^image\/jpeg/);
      expect(Buffer.from(served.body as Buffer).equals(newLogo)).toBe(true);
    });
  });

  it("offers no way to write without a session", async () => {
    for (const method of ["put", "post", "delete", "patch"] as const) {
      const response = await t
        .http()
        [method](`/public/barbershops/${custom.slug}/identity`)
        .send({ name: "Hacked" });
      expect([401, 404, 405]).toContain(response.status);
    }
    const after = PublicIdentity.parse((await identityOf(custom.slug)).body);
    expect(after.name).toBe("Billy Barbearia");
  });

  it("does not open the authenticated identity to visitors", async () => {
    expect((await t.http().get("/branding")).status).toBe(401);
  });
});

describe("public identity rate limit", () => {
  let t: TestApp;
  let shop: BrandingShop;

  beforeAll(async () => {
    t = await createApp({ limitPerMinute: 5 });
    shop = await createBrandingShop(t, "Public Limit");
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("answers 429 after the allowed calls per minute, for both public routes", async () => {
    const statuses: number[] = [];
    for (let call = 0; call < 8; call += 1) {
      statuses.push(
        (await t.http().get(`/public/barbershops/${shop.slug}/identity`))
          .status,
      );
    }
    expect(statuses.slice(0, 5).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(5)).toContain(429);

    const logoStatuses: number[] = [];
    for (let call = 0; call < 8; call += 1) {
      logoStatuses.push(
        (await t.http().get(`/public/barbershops/${shop.slug}/logo`)).status,
      );
    }
    expect(logoStatuses.slice(0, 5).every((status) => status === 404)).toBe(
      true,
    );
    expect(logoStatuses.slice(5)).toContain(429);
  });
});
