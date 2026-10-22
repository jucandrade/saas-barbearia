import { describe, expect, it } from "vitest";
import { TermsOutput, TermsQuery } from "../src/catalog/terms.js";

const ID = "0a4f3f1e-6d6b-4c63-9a52-0e2d6a9f7a11";

describe("TermsQuery", () => {
  it("needs the id of the executor", () => {
    expect(TermsQuery.safeParse({ userId: ID }).success).toBe(true);
    expect(TermsQuery.safeParse({}).success).toBe(false);
    expect(TermsQuery.safeParse({ userId: "x" }).success).toBe(false);
  });
});

describe("TermsOutput", () => {
  const terms = {
    priceCents: 6000,
    durationMinutes: 30,
    priceSource: "executor",
    durationSource: "service",
  };

  it("describes the price and duration and where each comes from", () => {
    expect(TermsOutput.safeParse(terms).success).toBe(true);
  });

  it("knows only executor and service as sources", () => {
    expect(
      TermsOutput.safeParse({ ...terms, priceSource: "default" }).success,
    ).toBe(false);
  });

  it("keeps the same limits as the service", () => {
    expect(TermsOutput.safeParse({ ...terms, priceCents: -1 }).success).toBe(
      false,
    );
    expect(
      TermsOutput.safeParse({ ...terms, durationMinutes: 37 }).success,
    ).toBe(false);
  });
});
