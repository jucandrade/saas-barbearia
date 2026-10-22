import { describe, expect, it } from "vitest";
import {
  InviteInput,
  InviteOutput,
  TeamOutput,
  ResendOutput,
} from "../src/index.js";

const uuid = "0f9b6d8e-6a1f-4c1e-9a53-3d1b8a7c2e10";
const user = {
  id: uuid,
  name: "Bia",
  email: "bia@example.com",
  role: "barber",
  status: "invited",
  barbershopId: uuid,
};

describe("InviteInput", () => {
  const valid = {
    name: "Bia Lima",
    email: " BIA@Example.com ",
    role: "barber",
  };

  it("normalizes the e-mail and accepts both roles", () => {
    expect(InviteInput.parse(valid).email).toBe("bia@example.com");
    expect(InviteInput.safeParse({ ...valid, role: "owner" }).success).toBe(
      true,
    );
  });

  it("rejects empty name, name over 120 characters, invalid e-mail and unknown role", () => {
    expect(InviteInput.safeParse({ ...valid, name: "  " }).success).toBe(false);
    expect(
      InviteInput.safeParse({ ...valid, name: "x".repeat(121) }).success,
    ).toBe(false);
    expect(InviteInput.safeParse({ ...valid, email: "bia" }).success).toBe(
      false,
    );
    expect(InviteInput.safeParse({ ...valid, role: "manager" }).success).toBe(
      false,
    );
  });
});

describe("team outputs", () => {
  it("TeamOutput lists users", () => {
    expect(TeamOutput.parse({ users: [user] }).users).toHaveLength(1);
    expect(
      TeamOutput.safeParse({
        users: [{ ...user, status: "anonymized" }],
      }).success,
    ).toBe(false);
  });

  it("InviteOutput and ResendOutput report whether the e-mail was sent", () => {
    expect(
      InviteOutput.parse({ user, invitationSent: true }).invitationSent,
    ).toBe(true);
    expect(InviteOutput.safeParse({ user }).success).toBe(false);
    expect(ResendOutput.parse({ invitationSent: false }).invitationSent).toBe(
      false,
    );
  });
});
