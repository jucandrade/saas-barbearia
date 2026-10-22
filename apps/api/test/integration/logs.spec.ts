import { Controller, Get } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Public } from "../../src/identity/auth/decorators.js";
import { PasswordService } from "../../src/identity/security/password.service.js";
import { CapturingLogger, createApp, type TestApp } from "./helpers/app.js";
import { closeConnections } from "./helpers/db.js";
import {
  createAccessToken,
  createBarbershop,
  createUser,
} from "./helpers/factory.js";

const PASSWORD = "barber-chair-secret";

@Public()
@Controller("boom")
class Boom {
  @Get()
  boom(): never {
    // Mimics Drizzle, whose messages carry the query parameters (such as e-mails).
    throw new Error("Failed query: insert ... params: boom-victim@example.com");
  }
}

describe("log hygiene (principle IX)", () => {
  const logger = new CapturingLogger();
  const consoleLines: string[] = [];
  let t: TestApp;

  beforeAll(async () => {
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        consoleLines.push(args.map(String).join(" "));
      });
    }
    t = await createApp({ logger, controllers: [Boom] });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await t.close();
    await closeConnections();
  });

  it("failing logins, invitations, recovery and a simulated SMTP failure leave no personal data in the logs", async () => {
    const hash = await t.app.get(PasswordService).hash(PASSWORD);
    const { barbershopId: tenantId } =
      await createBarbershop("Logs Barbershop");
    const ownerId = await createUser({
      tenantId,
      name: "Logs Owner Person",
      email: "logs-owner@example.com",
      role: "owner",
      passwordHash: hash,
    });
    const invitedId = await createUser({
      tenantId,
      name: "Logs Invited Person",
      email: "logs-invited@example.com",
      role: "barber",
      status: "invited",
    });
    const invitationToken = await createAccessToken({
      tenantId,
      userId: invitedId,
      expiresAt: new Date(t.clock.now().getTime() + 60_000),
    });
    const ownerSession = await t.openSession({
      id: ownerId,
      tenantId,
      role: "owner",
    });

    // 1. login failures: known account and unknown e-mail
    await t.http().post("/auth/login").send({
      email: "logs-owner@example.com",
      password: "wrong-guess-pass",
      client: "web",
    });
    await t.http().post("/auth/login").send({
      email: "logs-ghost@example.com",
      password: "ghost-secret-pass",
      client: "web",
    });
    // 2. invitation with a weak password
    await t
      .http()
      .post("/auth/invitations/accept")
      .send({ token: invitationToken, password: "12345678", client: "web" });
    // 3. recovery: e-mail sending fails once, then works and the reset is refused as weak
    t.email.failNext = true;
    await t
      .http()
      .post("/auth/password/forgot")
      .send({ email: "logs-owner@example.com" });
    await t
      .http()
      .post("/auth/password/forgot")
      .send({ email: "logs-owner@example.com" });
    const recoveryMessage = t.email.lastTo("logs-owner@example.com");
    const recoveryToken =
      /\/reset-password\/([A-Za-z0-9_-]+)/.exec(
        recoveryMessage?.text ?? "",
      )?.[1] ?? "";
    await t
      .http()
      .post("/auth/password/reset")
      .send({ token: recoveryToken, password: "12345678" });
    // 4. invitation e-mail fails to send
    t.email.failNext = true;
    await t
      .http()
      .post("/team/invitations")
      .set("Authorization", `Bearer ${ownerSession}`)
      .send({
        name: "Logs New Person",
        email: "logs-new@example.com",
        role: "barber",
      });
    // 5. unexpected server error carrying an e-mail in its message
    const boom = await t.http().get("/boom");
    expect(boom.status).toBe(500);

    const output = [...logger.lines, ...consoleLines].join("\n");

    // The capture works: the failures above were really logged.
    expect(output).toContain("Failed to send");
    expect(output).toContain("500");

    for (const forbidden of [
      "logs-owner@example.com",
      "logs-ghost@example.com",
      "logs-invited@example.com",
      "logs-new@example.com",
      "boom-victim@example.com",
      "Logs Owner Person",
      "Logs Invited Person",
      "Logs New Person",
      PASSWORD,
      "wrong-guess-pass",
      "ghost-secret-pass",
      "12345678",
      invitationToken,
      recoveryToken,
      "127.0.0.1",
      "::ffff:",
    ]) {
      expect(output, `the logs must not contain "${forbidden}"`).not.toContain(
        forbidden,
      );
    }
  });
});
