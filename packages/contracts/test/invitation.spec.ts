import { describe, expect, it } from "vitest";
import {
  AcceptInvitationInput,
  InvitationInfo,
  MeOutput,
  ProvisionBarbershopCommand,
  SessionOutput,
} from "../src/index.js";

const uuid = "0f9b6d8e-6a1f-4c1e-9a53-3d1b8a7c2e10";
const user = {
  id: uuid,
  name: "Ana",
  email: "ana@example.com",
  role: "owner",
  status: "active",
  barbershopId: uuid,
};

describe("invitation", () => {
  it("ConviteInfo exige nome e barbearia", () => {
    expect(
      InvitationInfo.safeParse({ name: "Ana", barbershop: "Pilot" }).success,
    ).toBe(true);
    expect(InvitationInfo.safeParse({ name: "Ana" }).success).toBe(false);
  });

  it("AcceptInvitationInput accepts web and mobile and rejects another client", () => {
    const base = { token: "t", password: "cadeira7" };
    expect(
      AcceptInvitationInput.safeParse({ ...base, client: "web" }).success,
    ).toBe(true);
    expect(
      AcceptInvitationInput.safeParse({ ...base, client: "mobile" }).success,
    ).toBe(true);
    expect(
      AcceptInvitationInput.safeParse({ ...base, client: "desktop" }).success,
    ).toBe(false);
    expect(AcceptInvitationInput.safeParse({ ...base }).success).toBe(false);
  });

  it("SessionOutput has an optional token", () => {
    expect(SessionOutput.safeParse({ user }).success).toBe(true);
    expect(SessionOutput.safeParse({ user, token: "abc" }).success).toBe(true);
  });
});

describe("ProvisionBarbershopCommand", () => {
  const valid = {
    name: "Barbearia Piloto",
    unit: "Main",
    timezone: "America/Sao_Paulo",
    ownerName: "Dona Ana",
    ownerEmail: "  Ana@Example.com ",
  };

  it("normalizes the owner's e-mail", () => {
    expect(ProvisionBarbershopCommand.parse(valid).ownerEmail).toBe(
      "ana@example.com",
    );
  });

  it("rejects a name over 120 characters and a malformed e-mail", () => {
    expect(
      ProvisionBarbershopCommand.safeParse({
        ...valid,
        name: "x".repeat(121),
      }).success,
    ).toBe(false);
    expect(
      ProvisionBarbershopCommand.safeParse({ ...valid, ownerEmail: "ana@" })
        .success,
    ).toBe(false);
    expect(
      ProvisionBarbershopCommand.safeParse({ ...valid, unit: "" }).success,
    ).toBe(false);
  });
});

describe("MeOutput", () => {
  it("returns user and barbershop with units", () => {
    const eu = {
      user,
      barbershop: {
        id: uuid,
        name: "Pilot",
        units: [{ id: uuid, name: "Main", timezone: "America/Sao_Paulo" }],
      },
    };
    expect(MeOutput.parse(eu)).toEqual(eu);
  });
});

describe("LoginInput", () => {
  it("normaliza o e-mail e exige o cliente", async () => {
    const { LoginInput } = await import("../src/index.js");
    expect(
      LoginInput.parse({
        email: " Ana@Example.com ",
        password: "x",
        client: "web",
      }).email,
    ).toBe("ana@example.com");
    expect(
      LoginInput.safeParse({ email: "ana@example.com", password: "x" }).success,
    ).toBe(false);
    expect(
      LoginInput.safeParse({ email: "ana", password: "x", client: "web" })
        .success,
    ).toBe(false);
    expect(
      LoginInput.safeParse({
        email: "ana@example.com",
        password: "",
        client: "web",
      }).success,
    ).toBe(false);
  });
});
