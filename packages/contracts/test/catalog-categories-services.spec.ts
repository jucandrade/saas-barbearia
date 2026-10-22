import { describe, expect, it } from "vitest";
import {
  CategoriesOutput,
  CreateCategoryInput,
  OrderInput,
  RenameCategoryInput,
} from "../src/catalog/categories.js";
import {
  CreateServiceInput,
  Service,
  ServicesOutput,
  UpdateServiceInput,
} from "../src/catalog/services.js";

const ID = "0a4f3f1e-6d6b-4c63-9a52-0e2d6a9f7a11";
const OTHER_ID = "7c1b8d2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e";

describe("category inputs", () => {
  it("accept a valid name and trim it", () => {
    expect(CreateCategoryInput.parse({ name: " Cabelo " })).toEqual({
      name: "Cabelo",
    });
    expect(RenameCategoryInput.parse({ name: "Barba" })).toEqual({
      name: "Barba",
    });
  });

  it.each(["", "   ", "a".repeat(81)])("reject the name %j", (name) => {
    expect(CreateCategoryInput.safeParse({ name }).success).toBe(false);
    expect(RenameCategoryInput.safeParse({ name }).success).toBe(false);
  });

  it("OrderInput takes a list of ids", () => {
    expect(OrderInput.safeParse({ ids: [ID, OTHER_ID] }).success).toBe(true);
    expect(OrderInput.safeParse({ ids: [] }).success).toBe(true);
    expect(OrderInput.safeParse({ ids: ["x"] }).success).toBe(false);
    expect(OrderInput.safeParse({}).success).toBe(false);
  });
});

describe("CreateServiceInput", () => {
  const valid = {
    name: "Corte",
    categoryId: ID,
    priceCents: 5000,
    durationMinutes: 30,
  };

  it("accepts the required fields, with or without description", () => {
    expect(CreateServiceInput.safeParse(valid).success).toBe(true);
    expect(
      CreateServiceInput.safeParse({ ...valid, description: "Na tesoura" })
        .success,
    ).toBe(true);
  });

  it("accepts a free service (price zero)", () => {
    expect(
      CreateServiceInput.safeParse({ ...valid, priceCents: 0 }).success,
    ).toBe(true);
  });

  it.each([
    ["empty name", { name: "" }],
    ["name of 81 characters", { name: "a".repeat(81) }],
    ["duration 37", { durationMinutes: 37 }],
    ["duration 600", { durationMinutes: 600 }],
    ["duration 0", { durationMinutes: 0 }],
    ["negative price", { priceCents: -1 }],
    ["price above the cap", { priceCents: 1_000_001 }],
    ["fractional price", { priceCents: 10.5 }],
    ["category that is not an id", { categoryId: "x" }],
    ["description of 501 characters", { description: "x".repeat(501) }],
  ])("rejects %s", (_title, change) => {
    expect(CreateServiceInput.safeParse({ ...valid, ...change }).success).toBe(
      false,
    );
  });

  it.each(["name", "categoryId", "priceCents", "durationMinutes"])(
    "requires the mandatory field %s",
    (key) => {
      const copy = Object.fromEntries(
        Object.entries(valid).filter(([field]) => field !== key),
      );
      expect(CreateServiceInput.safeParse(copy).success).toBe(false);
    },
  );
});

describe("UpdateServiceInput", () => {
  it("accepts any subset of fields", () => {
    expect(UpdateServiceInput.safeParse({ priceCents: 5500 }).success).toBe(
      true,
    );
    expect(
      UpdateServiceInput.safeParse({ name: "Corte", durationMinutes: 45 })
        .success,
    ).toBe(true);
  });

  it("accepts null in description to clear it", () => {
    expect(UpdateServiceInput.safeParse({ description: null }).success).toBe(
      true,
    );
  });

  it("rejects an empty body", () => {
    expect(UpdateServiceInput.safeParse({}).success).toBe(false);
  });

  it("applies the same limits as the creation", () => {
    expect(UpdateServiceInput.safeParse({ durationMinutes: 37 }).success).toBe(
      false,
    );
    expect(UpdateServiceInput.safeParse({ priceCents: -1 }).success).toBe(
      false,
    );
    expect(UpdateServiceInput.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("outputs", () => {
  const service = {
    id: ID,
    name: "Corte",
    description: null,
    categoryId: OTHER_ID,
    priceCents: 5000,
    durationMinutes: 30,
    status: "active",
    mine: false,
    effective: { priceCents: 5000, durationMinutes: 30 },
  };

  it("Service accepts the owner's extra field and works without it", () => {
    expect(Service.safeParse(service).success).toBe(true);
    expect(Service.safeParse({ ...service, executorCount: 2 }).success).toBe(
      true,
    );
    expect(Service.safeParse({ ...service, executorCount: -1 }).success).toBe(
      false,
    );
  });

  it("lists wrap their items", () => {
    expect(ServicesOutput.safeParse({ services: [service] }).success).toBe(
      true,
    );
    expect(
      CategoriesOutput.safeParse({
        categories: [{ id: ID, name: "Cabelo", position: 0 }],
      }).success,
    ).toBe(true);
  });
});
