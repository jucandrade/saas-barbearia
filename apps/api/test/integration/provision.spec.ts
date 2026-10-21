import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/commands.js";
import {
  barbershop,
  securityEvent,
  unit,
  user,
} from "../../src/db/schema/index.js";
import { AuditService } from "../../src/identity/audit/audit.service.js";
import { PlatformError } from "../../src/identity/provisioning/platform-error.js";
import { hashToken } from "../../src/identity/security/tokens.js";
import { ADMIN_ORIGIN } from "./helpers/app.js";
import {
  withTenantAdmin,
  adminConnection,
  countBarbershops,
  countUsersByEmail,
  closeConnections,
} from "./helpers/db.js";
import {
  createPlatformTools,
  invitationTokenFrom,
} from "./helpers/platform.js";

const DAY = 24 * 60 * 60 * 1000;

function data(suffix: string) {
  return {
    name: `Prov ${suffix}`,
    unit: "Main",
    timezone: "America/Sao_Paulo",
    ownerName: "Dona Ana",
    ownerEmail: `ana-${suffix}@example.com`,
  };
}

describe("provision-barbershop", () => {
  afterAll(closeConnections);

  it("creates barbershop, unit and invited owner in a single transaction", async () => {
    const f = createPlatformTools();
    const r = await f.provisioning.provision({
      ...data("a"),
      ownerEmail: "  Ana-A@Example.com ",
    });

    const created = await withTenantAdmin(r.barbershopId, async (tx) => ({
      barbershops: await tx.select().from(barbershop),
      units: await tx.select().from(unit),
      users: await tx.select().from(user),
    }));
    expect(created.barbershops).toMatchObject([
      { id: r.barbershopId, name: "Prov a" },
    ]);
    expect(created.units).toMatchObject([
      {
        tenantId: r.barbershopId,
        name: "Main",
        timezone: "America/Sao_Paulo",
      },
    ]);
    expect(created.users).toMatchObject([
      {
        tenantId: r.barbershopId,
        name: "Dona Ana",
        email: "ana-a@example.com",
        role: "owner",
        status: "invited",
        passwordHash: null,
      },
    ]);
    expect(r.invitationSent).toBe(true);
  });

  it("sends the invitation, valid for 7 days, and stores only the token hash", async () => {
    const f = createPlatformTools();
    await f.provisioning.provision(data("b"));
    const message = f.email.lastTo("ana-b@example.com");
    expect(message?.text).toContain(`${ADMIN_ORIGIN}/invitation/`);

    const token = invitationTokenFrom(message?.text ?? "");
    const stored = await f.tenantDb
      .withoutTenant()
      .findAccessToken(hashToken(token), "invitation");
    expect(stored?.expiresAt).toEqual(
      new Date(f.clock.now().getTime() + 7 * DAY),
    );
    expect(stored?.usedAt).toBeNull();
  });

  it("records barbershop_provisioned and invitation_sent with platform actor, without personal data", async () => {
    const f = createPlatformTools();
    const r = await f.provisioning.provision(data("c"));
    const events = await withTenantAdmin(r.barbershopId, (tx) =>
      tx.select().from(securityEvent),
    );
    expect(events.map((e) => e.type).sort()).toEqual([
      "barbershop_provisioned",
      "invitation_sent",
    ]);
    expect(
      events.every((e) => e.actorType === "platform" && e.actorUserId === null),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toContain("ana-c@example.com");
    expect(JSON.stringify(events)).not.toContain("Dona Ana");
  });

  it("an e-mail already in use fails with 'E-mail unavailable' and creates nothing", async () => {
    const f = createPlatformTools();
    await f.provisioning.provision(data("d"));
    await expect(
      f.provisioning.provision({
        ...data("d2"),
        ownerEmail: "ana-d@example.com",
      }),
    ).rejects.toThrow(new PlatformError("E-mail unavailable."));
    expect(await countBarbershops("Prov d2")).toBe(0);
    expect(await countUsersByEmail("ana-d@example.com")).toBe(1);
  });

  it("an unknown time zone fails and creates nothing", async () => {
    const f = createPlatformTools();
    await expect(
      f.provisioning.provision({ ...data("e"), timezone: "Mars/Olympus" }),
    ).rejects.toThrow(/time zone/i);
    expect(await countBarbershops("Prov e")).toBe(0);
    expect(await countUsersByEmail("ana-e@example.com")).toBe(0);
  });

  it("a failure in the middle of the transaction leaves nothing half-done", async () => {
    const failingAudit = Object.assign(new AuditService(adminConnection()), {
      record: () => Promise.reject(new Error("falha simulada")),
    });
    const f = createPlatformTools({ audit: failingAudit });
    await expect(f.provisioning.provision(data("f"))).rejects.toThrow();
    expect(await countBarbershops("Prov f")).toBe(0);
    expect(await countUsersByEmail("ana-f@example.com")).toBe(0);
    expect(f.email.messages).toHaveLength(0);
  });

  it("two simultaneous provisionings with the same e-mail: only one succeeds", async () => {
    const f = createPlatformTools();
    const results = await Promise.allSettled([
      f.provisioning.provision({
        ...data("g1"),
        ownerEmail: "ana-g@example.com",
      }),
      f.provisioning.provision({
        ...data("g2"),
        ownerEmail: "ana-g@example.com",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected");
    expect(failure?.status === "rejected" && failure.reason).toEqual(
      new PlatformError("E-mail unavailable."),
    );
    expect(
      (await countBarbershops("Prov g1")) + (await countBarbershops("Prov g2")),
    ).toBe(1);
    expect(await countUsersByEmail("ana-g@example.com")).toBe(1);
  });

  it("does not create a user or barbershop in another tenant by mistake (each provisioning is isolated)", async () => {
    const f = createPlatformTools();
    const a = await f.provisioning.provision(data("h1"));
    const b = await f.provisioning.provision(data("h2"));
    expect(a.barbershopId).not.toBe(b.barbershopId);
    const deA = await withTenantAdmin(a.barbershopId, (tx) =>
      tx.select().from(user).where(eq(user.tenantId, b.barbershopId)),
    );
    expect(deA).toHaveLength(0);
  });

  describe("command line", () => {
    const argv = (suffix: string) => {
      const d = data(suffix);
      return [
        "provision-barbershop",
        "--name",
        d.name,
        "--unit",
        d.unit,
        "--timezone",
        d.timezone,
        "--owner-name",
        d.ownerName,
        "--owner-email",
        d.ownerEmail,
      ];
    };
    function io() {
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
    }

    it("exits with code 0 and prints only the barbershop id, without token or link", async () => {
      const f = createPlatformTools();
      const c = io();
      const code = await runCli(argv("i"), f, c.io);
      expect(code).toBe(0);
      const text = [...c.output, ...c.error].join("\n");
      expect(text).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      const message = f.email.lastTo("ana-i@example.com");
      expect(message).toBeDefined();
      expect(text).not.toContain(invitationTokenFrom(message?.text ?? ""));
      expect(text).not.toContain("/invitation/");
      expect(text).not.toContain("ana-i@example.com");
    });

    it("a repeated e-mail exits with a non-zero code and a clear message", async () => {
      const f = createPlatformTools();
      await runCli(argv("j"), f, io().io);
      const c = io();
      const code = await runCli(
        [...argv("j2").slice(0, -1), "ana-j@example.com"],
        f,
        c.io,
      );
      expect(code).not.toBe(0);
      expect(c.error.join("\n")).toContain("E-mail unavailable");
    });

    it("invalid arguments exit with a non-zero code and point to the field", async () => {
      const f = createPlatformTools();
      const c = io();
      const code = await runCli([...argv("k").slice(0, -1), "ana@"], f, c.io);
      expect(code).not.toBe(0);
      expect(c.error.join("\n")).toMatch(/ownerEmail/);
      expect(await countBarbershops("Prov k")).toBe(0);
    });

    it("an unknown command exits with a non-zero code", async () => {
      const f = createPlatformTools();
      const c = io();
      expect(await runCli(["nao-exists"], f, c.io)).not.toBe(0);
      expect(c.error.join("\n")).toMatch(/Available commands/);
    });

    it("if e-mail sending fails, the barbershop stays created and the code is 3, advising to resend", async () => {
      const f = createPlatformTools();
      f.email.failNext = true;
      const c = io();
      const code = await runCli(argv("l"), f, c.io);
      expect(code).toBe(3);
      expect(c.error.join("\n")).toContain("resend-owner-invitation");
      expect(await countBarbershops("Prov l")).toBe(1);
    });
  });
});
