import { describe, expect, it } from "vitest";
import { MemoryAdapter } from "../src/identity/email/memory.adapter.js";
import {
  invitationLink,
  recoveryLink,
  invitationTemplate,
  recoveryTemplate,
} from "../src/identity/email/templates.js";

describe("e-mail templates", () => {
  it("the invitation carries the link, the barbershop and the 7-day validity", () => {
    const link = invitationLink("http://localhost:3001", "tok123");
    expect(link).toBe("http://localhost:3001/invitation/tok123");
    const { subject, text } = invitationTemplate({
      name: "Ana",
      barbershop: "Pilot",
      link,
    });
    expect(subject).toContain("Pilot");
    expect(text).toContain(link);
    expect(text).toContain("7 dias");
  });

  it("recovery carries the link and the 1-hour validity", () => {
    const link = recoveryLink("http://localhost:3001", "tok456");
    expect(link).toBe("http://localhost:3001/reset-password/tok456");
    const { text } = recoveryTemplate({ name: "Ana", link });
    expect(text).toContain(link);
    expect(text).toContain("1 hora");
  });
});

describe("MemoryAdapter", () => {
  it("stores the messages and finds the last one per recipient", async () => {
    const email = new MemoryAdapter();
    await email.send({ to: "a@x.com", subject: "1", text: "one" });
    await email.send({ to: "b@x.com", subject: "2", text: "two" });
    await email.send({ to: "a@x.com", subject: "3", text: "three" });
    expect(email.lastTo("a@x.com")?.subject).toBe("3");
    expect(email.lastTo("c@x.com")).toBeUndefined();
  });

  it("can simulate a sending failure exactly once", async () => {
    const email = new MemoryAdapter();
    email.failNext = true;
    await expect(
      email.send({ to: "a@x.com", subject: "x", text: "y" }),
    ).rejects.toThrow(/SMTP/);
    await expect(
      email.send({ to: "a@x.com", subject: "x", text: "y" }),
    ).resolves.toBeUndefined();
  });
});
