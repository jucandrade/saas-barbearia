import { afterAll, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/commands.js";
import { securityEvent, user } from "../../src/db/schema/index.js";
import { PlatformError } from "../../src/identity/provisioning/platform-error.js";
import { hashToken } from "../../src/identity/security/tokens.js";
import {
  withTenantAdmin,
  countUsersByEmail,
  closeConnections,
} from "./helpers/db.js";
import { createBarbershop, createUser } from "./helpers/factory.js";
import {
  createPlatformTools,
  invitationTokenFrom,
} from "./helpers/platform.js";

let n = 0;
async function newOwner(f: ReturnType<typeof createPlatformTools>) {
  n += 1;
  const email = `owner-resend-${String(n)}@example.com`;
  const r = await f.provisioning.provision({
    name: `Reenvio ${String(n)}`,
    unit: "Main",
    timezone: "America/Sao_Paulo",
    ownerName: "Dona Ana",
    ownerEmail: email,
  });
  const tokenOld = invitationTokenFrom(f.email.lastTo(email)?.text ?? "");
  f.email.clear();
  return { ...r, email, tokenOld };
}

describe("resend-owner-invitation", () => {
  afterAll(closeConnections);

  it("invalidates the previous invitation, creates another valid for 7 days and resends", async () => {
    const f = createPlatformTools();
    const d = await newOwner(f);
    f.clock.advance(2 * 24 * 60 * 60 * 1000);

    const r = await f.resend.resend({ email: d.email });
    expect(r.invitationSent).toBe(true);

    const old = await f.tenantDb
      .withoutTenant()
      .findAccessToken(hashToken(d.tokenOld), "invitation");
    expect(old?.invalidatedAt).toEqual(f.clock.now());

    const next = invitationTokenFrom(f.email.lastTo(d.email)?.text ?? "");
    expect(next).not.toBe(d.tokenOld);
    const stored = await f.tenantDb
      .withoutTenant()
      .findAccessToken(hashToken(next), "invitation");
    expect(stored?.invalidatedAt).toBeNull();
    expect(stored?.expiresAt).toEqual(
      new Date(f.clock.now().getTime() + 7 * 24 * 60 * 60 * 1000),
    );
  });

  it("rejects an already active owner, a barber and an unknown e-mail", async () => {
    const f = createPlatformTools();
    const { barbershopId } = await createBarbershop("Reenvio recusas");
    await createUser({
      tenantId: barbershopId,
      email: "active-resend@example.com",
      role: "owner",
      status: "active",
    });
    await createUser({
      tenantId: barbershopId,
      email: "barber-resend@example.com",
      role: "barber",
      status: "invited",
    });

    await expect(
      f.resend.resend({ email: "active-resend@example.com" }),
    ).rejects.toBeInstanceOf(PlatformError);
    await expect(
      f.resend.resend({ email: "barber-resend@example.com" }),
    ).rejects.toBeInstanceOf(PlatformError);
    await expect(
      f.resend.resend({ email: "nobody-resend@example.com" }),
    ).rejects.toBeInstanceOf(PlatformError);
    expect(f.email.messages).toHaveLength(0);
  });

  it("--new-email fixes the e-mail while invited and sends to the new address", async () => {
    const f = createPlatformTools();
    const d = await newOwner(f);
    const fixed = `fixed-${String(n)}@example.com`;
    await f.resend.resend({
      email: d.email,
      newEmail: `  ${fixed.toUpperCase()} `,
    });

    expect(f.email.lastTo(fixed)).toBeDefined();
    expect(f.email.lastTo(d.email)).toBeUndefined();
    expect(await countUsersByEmail(d.email)).toBe(0);
    const u = await withTenantAdmin(d.barbershopId, (tx) =>
      tx.select().from(user),
    );
    expect(u[0]?.email).toBe(fixed);
  });

  it("--new-email rejects an e-mail that already exists", async () => {
    const f = createPlatformTools();
    const a = await newOwner(f);
    const b = await newOwner(f);
    await expect(
      f.resend.resend({ email: a.email, newEmail: b.email }),
    ).rejects.toThrow(new PlatformError("E-mail unavailable."));
    expect(await countUsersByEmail(a.email)).toBe(1);
  });

  it("records invitation_sent with platform actor", async () => {
    const f = createPlatformTools();
    const d = await newOwner(f);
    await f.resend.resend({ email: d.email });
    const events = await withTenantAdmin(d.barbershopId, (tx) =>
      tx.select().from(securityEvent),
    );
    const sent = events.filter((e) => e.type === "invitation_sent");
    expect(sent).toHaveLength(2);
    expect(sent.every((e) => e.actorType === "platform")).toBe(true);
    expect(JSON.stringify(events)).not.toContain(d.email);
  });

  describe("command", () => {
    const io = () => {
      const output: string[] = [];
      const error: string[] = [];
      return {
        output,
        error,
        io: {
          out: (m: string) => output.push(m),
          err: (m: string) => error.push(m),
        },
      };
    };

    it("exits with code 0 when it resends", async () => {
      const f = createPlatformTools();
      const d = await newOwner(f);
      const c = io();
      expect(
        await runCli(["resend-owner-invitation", "--email", d.email], f, c.io),
      ).toBe(0);
      expect(f.email.lastTo(d.email)).toBeDefined();
      expect([...c.output, ...c.error].join("\n")).not.toContain(d.email);
    });

    it("exits with a non-zero code for an unknown e-mail", async () => {
      const f = createPlatformTools();
      const c = io();
      expect(
        await runCli(
          ["resend-owner-invitation", "--email", "never@example.com"],
          f,
          c.io,
        ),
      ).not.toBe(0);
      expect(c.error.length).toBeGreaterThan(0);
    });
  });
});
