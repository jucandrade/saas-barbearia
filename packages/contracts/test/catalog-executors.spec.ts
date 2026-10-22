import { describe, expect, it } from "vitest";
import {
  Executor,
  ExecutorInput,
  ExecutorsOutput,
} from "../src/catalog/executors.js";

const ID = "0a4f3f1e-6d6b-4c63-9a52-0e2d6a9f7a11";

describe("ExecutorInput", () => {
  it("accepts an empty body (link without specific values)", () => {
    expect(ExecutorInput.parse({})).toEqual({});
  });

  it("accepts specific price and duration", () => {
    expect(
      ExecutorInput.safeParse({ priceCents: 6000, durationMinutes: 45 })
        .success,
    ).toBe(true);
  });

  it("accepts a specific price of zero", () => {
    expect(ExecutorInput.safeParse({ priceCents: 0 }).success).toBe(true);
  });

  it("accepts null to go back to the service default", () => {
    expect(
      ExecutorInput.safeParse({ priceCents: null, durationMinutes: null })
        .success,
    ).toBe(true);
  });

  it.each([
    ["duration 37", { durationMinutes: 37 }],
    ["duration 600", { durationMinutes: 600 }],
    ["negative price", { priceCents: -1 }],
    ["price above the cap", { priceCents: 1_000_001 }],
    ["fractional price", { priceCents: 10.5 }],
  ])("rejects %s with the same limits as the service", (_title, body) => {
    expect(ExecutorInput.safeParse(body).success).toBe(false);
  });
});

describe("Executor and ExecutorsOutput", () => {
  const executor = {
    userId: ID,
    name: "Bruno",
    priceCents: null,
    durationMinutes: 45,
  };

  it("describes an executor without e-mail", () => {
    expect(Executor.safeParse(executor).success).toBe(true);
    expect(Object.keys(Executor.parse(executor)).sort()).toEqual([
      "durationMinutes",
      "name",
      "priceCents",
      "userId",
    ]);
  });

  it("omits the specific values when the caller may not see them", () => {
    expect(Executor.safeParse({ userId: ID, name: "Bruno" }).success).toBe(
      true,
    );
  });

  it("wraps the list", () => {
    expect(ExecutorsOutput.safeParse({ executors: [executor] }).success).toBe(
      true,
    );
    expect(ExecutorsOutput.safeParse({}).success).toBe(false);
  });
});
