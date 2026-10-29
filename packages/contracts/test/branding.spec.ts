import { describe, expect, it } from "vitest";
import {
  Branding,
  DisplayName,
  PublicIdentity,
  UpdateBrandingInput,
} from "../src/branding/index.js";

const valid = {
  name: "Barbearia do Billy",
  theme: "day",
  primaryTone: "blue",
  accentTone: "gold",
} as const;

describe("DisplayName", () => {
  it("trims and accepts 1 to 80 characters", () => {
    expect(DisplayName.parse("  Billy  ")).toBe("Billy");
    expect(DisplayName.safeParse("a".repeat(80)).success).toBe(true);
  });

  it("rejects empty, whitespace only and 81 characters with a message in Portuguese", () => {
    for (const name of ["", "   ", "a".repeat(81)]) {
      const result = DisplayName.safeParse(name);
      expect(result.success).toBe(false);
    }
    const empty = DisplayName.safeParse("  ");
    expect(empty.error?.issues[0]?.message).toBe("Informe o nome.");
  });
});

describe("UpdateBrandingInput", () => {
  it("accepts a valid identity", () => {
    expect(UpdateBrandingInput.parse(valid)).toEqual(valid);
  });

  it("accepts the same tone as primary and accent", () => {
    expect(
      UpdateBrandingInput.safeParse({ ...valid, accentTone: "blue" }).success,
    ).toBe(true);
  });

  it.each([
    ["an empty name", { ...valid, name: "" }],
    ["a whitespace-only name", { ...valid, name: "   " }],
    ["an 81-character name", { ...valid, name: "a".repeat(81) }],
    ["a theme outside the list", { ...valid, theme: "sepia" }],
    ["a free color as the primary tone", { ...valid, primaryTone: "#ff0000" }],
    ["a free color as the accent tone", { ...valid, accentTone: "red" }],
    [
      "a missing theme",
      { name: valid.name, primaryTone: "blue", accentTone: "gold" },
    ],
  ])("rejects %s", (_label, input) => {
    expect(UpdateBrandingInput.safeParse(input).success).toBe(false);
  });
});

describe("Branding", () => {
  const output = {
    name: "Barbearia do Billy",
    theme: "leather",
    primaryTone: "sage",
    accentTone: "gold",
    logoUrl: "/public/barbershops/billy/logo?v=ab12",
    customized: true,
    updatedAt: "2026-10-28T20:00:00.000Z",
  };

  it("accepts the documented shape", () => {
    expect(Branding.parse(output)).toEqual(output);
  });

  it("accepts a barbershop without a logo or personalization", () => {
    const result = Branding.parse({
      ...output,
      logoUrl: null,
      customized: false,
      updatedAt: null,
    });
    expect(result.logoUrl).toBeNull();
    expect(result.customized).toBe(false);
  });

  it("falls back to Noir and gold for a theme or tone it does not know", () => {
    const result = Branding.parse({
      ...output,
      theme: "twilight",
      primaryTone: "magenta",
      accentTone: "",
    });
    expect(result.theme).toBe("noir");
    expect(result.primaryTone).toBe("gold");
    expect(result.accentTone).toBe("gold");
  });
});

describe("PublicIdentity", () => {
  it("accepts a null name only for the unknown-link default", () => {
    const result = PublicIdentity.parse({
      name: null,
      theme: "noir",
      primaryTone: "gold",
      accentTone: "gold",
      logoUrl: null,
    });
    expect(result.name).toBeNull();
  });

  it("falls back to the default for an unknown theme or tone", () => {
    const result = PublicIdentity.parse({
      name: "Billy",
      theme: "x",
      primaryTone: "y",
      accentTone: "z",
      logoUrl: null,
    });
    expect([result.theme, result.primaryTone, result.accentTone]).toEqual([
      "noir",
      "gold",
      "gold",
    ]);
  });
});
