import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Branding } from "@barbearia/contracts";
import { createApp, type TestApp } from "./helpers/app.js";
import { brandingEventsOf, createBrandingShop } from "./helpers/branding.js";
import { closeConnections } from "./helpers/db.js";
import { gif, jpeg, png, svg, truncatedPng, webp } from "./helpers/images.js";

describe("branding logo upload", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp();
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  function upload(
    auth: { Authorization: string } | undefined,
    contentType: string,
    body: Buffer,
  ) {
    const request = t
      .http()
      .put("/branding/logo")
      .set("Content-Type", contentType);
    return (auth === undefined ? request : request.set(auth)).send(body);
  }

  async function currentLogoUrl(auth: {
    Authorization: string;
  }): Promise<string | null> {
    const read = await t.http().get("/branding").set(auth);
    return Branding.parse(read.body).logoUrl;
  }

  it("accepts a valid PNG and exposes a versioned logo url", async () => {
    const shop = await createBrandingShop(t, "Logo Png");
    const response = await upload(shop.owner.auth, "image/png", png(200, 200));
    expect(response.status).toBe(200);
    const branding = Branding.parse(response.body);
    expect(branding.logoUrl).toMatch(
      new RegExp(`^/public/barbershops/${shop.slug}/logo\\?v=[0-9a-f]{16}$`),
    );
    expect(await currentLogoUrl(shop.owner.auth)).toBe(branding.logoUrl);
  });

  it("replacing the logo changes its version", async () => {
    const shop = await createBrandingShop(t, "Logo Replace");
    await upload(shop.owner.auth, "image/png", png(200, 200));
    const first = await currentLogoUrl(shop.owner.auth);
    await upload(shop.owner.auth, "image/jpeg", jpeg(300, 150));
    const second = await currentLogoUrl(shop.owner.auth);
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  it("accepts WebP, and exactly 524288 bytes", async () => {
    const shop = await createBrandingShop(t, "Logo Webp");
    expect(
      (await upload(shop.owner.auth, "image/webp", webp(256, 256))).status,
    ).toBe(200);
    expect(
      (await upload(shop.owner.auth, "image/png", png(200, 200, 524_288)))
        .status,
    ).toBe(200);
  });

  it.each([
    ["an SVG", "image/png", svg(), 400, "LOGO_UNSUPPORTED_FORMAT"],
    ["a GIF", "image/png", gif(), 400, "LOGO_UNSUPPORTED_FORMAT"],
    [
      "524289 bytes",
      "image/png",
      png(200, 200, 524_289),
      413,
      "LOGO_TOO_LARGE",
    ],
    [
      "a shorter side of 63",
      "image/png",
      png(500, 63),
      400,
      "LOGO_INVALID_DIMENSIONS",
    ],
    [
      "a longer side of 2001",
      "image/png",
      png(2001, 100),
      400,
      "LOGO_INVALID_DIMENSIONS",
    ],
    [
      "JPEG bytes declared as PNG",
      "image/png",
      jpeg(200, 200),
      400,
      "LOGO_CONTENT_MISMATCH",
    ],
    [
      "a truncated PNG",
      "image/png",
      truncatedPng(),
      400,
      "LOGO_CONTENT_MISMATCH",
    ],
  ])(
    "refuses %s and keeps the current logo",
    async (_name, contentType, body, status, code) => {
      const shop = await createBrandingShop(t, "Logo Refusal");
      await upload(shop.owner.auth, "image/png", png(200, 200));
      const before = await currentLogoUrl(shop.owner.auth);

      const response = await upload(shop.owner.auth, contentType, body);
      expect(response.status).toBe(status);
      expect(response.body).toMatchObject({ code });
      expect(
        (response.body as { message: string }).message.length,
      ).toBeGreaterThan(0);

      expect(await currentLogoUrl(shop.owner.auth)).toBe(before);
    },
  );

  it("refuses a body that is not an image type at all, leaving no logo", async () => {
    const shop = await createBrandingShop(t, "Logo Text");
    const response = await upload(
      shop.owner.auth,
      "text/plain",
      Buffer.from("hi"),
    );
    expect(response.status).toBe(400);
    expect(await currentLogoUrl(shop.owner.auth)).toBeNull();
  });

  it("answers a body above the parser ceiling in the API error format too", async () => {
    const shop = await createBrandingShop(t, "Logo Huge");
    const response = await upload(
      shop.owner.auth,
      "image/png",
      png(200, 200, 2 * 1024 * 1024),
    );
    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ code: "LOGO_TOO_LARGE" });
  });

  it("denies the barber and the visitor", async () => {
    const shop = await createBrandingShop(t, "Logo Permissions");
    const barber = await upload(shop.barber.auth, "image/png", png(200, 200));
    expect(barber.status).toBe(403);
    const visitor = await upload(undefined, "image/png", png(200, 200));
    expect(visitor.status).toBe(401);
    expect(await currentLogoUrl(shop.owner.auth)).toBeNull();
  });

  it("records logo_changed without bytes, file names or the logo itself", async () => {
    const shop = await createBrandingShop(t, "Logo Audit");
    await upload(shop.owner.auth, "image/png", png(200, 200));
    const events = await brandingEventsOf(shop.tenantId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "logo_changed",
      actorUserId: shop.owner.id,
    });
    const details = JSON.stringify(events[0]?.details);
    expect(details).not.toMatch(/png|bytes|content|filename/i);
  });
});
