import { describe, expect, it } from "vitest";
import {
  CatalogName,
  DurationMinutes,
  PriceCents,
  ServiceCategory,
  ServiceDescription,
  ServiceStatus,
} from "../src/catalog/common.js";

describe("CatalogName", () => {
  it("trims and accepts up to 80 characters", () => {
    expect(CatalogName.parse("  Corte ")).toBe("Corte");
    expect(CatalogName.safeParse("a".repeat(80)).success).toBe(true);
  });

  it("rejects empty and 81 characters", () => {
    expect(CatalogName.safeParse("   ").success).toBe(false);
    expect(CatalogName.safeParse("a".repeat(81)).success).toBe(false);
  });
});

describe("ServiceDescription", () => {
  it("accepts up to 500 characters and rejects 501", () => {
    expect(ServiceDescription.safeParse("x".repeat(500)).success).toBe(true);
    expect(ServiceDescription.safeParse("x".repeat(501)).success).toBe(false);
  });
});

describe("DurationMinutes", () => {
  it.each([5, 30, 480])("accepts %i", (minutes) => {
    expect(DurationMinutes.safeParse(minutes).success).toBe(true);
  });

  it.each([0, 4, 37, 485, 600, -5, 30.5])("rejects %s", (minutes) => {
    expect(DurationMinutes.safeParse(minutes).success).toBe(false);
  });

  it("explains the problem in Portuguese", () => {
    const step = DurationMinutes.safeParse(37);
    const range = DurationMinutes.safeParse(600);
    expect(step.error?.issues[0]?.message).toContain("múltipla de 5");
    expect(range.error?.issues[0]?.message).toContain("entre 5 e 480");
  });
});

describe("PriceCents", () => {
  it.each([0, 4500, 1_000_000])("accepts %i", (cents) => {
    expect(PriceCents.safeParse(cents).success).toBe(true);
  });

  it.each([-1, 1_000_001, 10.5])("rejects %s", (cents) => {
    expect(PriceCents.safeParse(cents).success).toBe(false);
  });
});

describe("ServiceStatus and ServiceCategory", () => {
  it("knows only active and deactivated", () => {
    expect(ServiceStatus.safeParse("active").success).toBe(true);
    expect(ServiceStatus.safeParse("deleted").success).toBe(false);
  });

  it("describes a category", () => {
    expect(
      ServiceCategory.safeParse({
        id: "0a4f3f1e-6d6b-4c63-9a52-0e2d6a9f7a11",
        name: "Cabelo",
        position: 0,
      }).success,
    ).toBe(true);
    expect(
      ServiceCategory.safeParse({ id: "x", name: "Cabelo", position: 0 })
        .success,
    ).toBe(false);
  });
});
