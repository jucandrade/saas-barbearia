import { describe, expect, it } from "vitest";
import { resolveTerms } from "../../src/catalog/terms.js";

const service = { priceCents: 5000, durationMinutes: 30 };

describe("resolveTerms", () => {
  it("uses the service defaults when there is no link", () => {
    expect(resolveTerms(service, null)).toEqual({
      priceCents: 5000,
      durationMinutes: 30,
      priceSource: "service",
      durationSource: "service",
    });
  });

  it("uses the service defaults when the link has no specific values", () => {
    expect(
      resolveTerms(service, { priceCents: null, durationMinutes: null }),
    ).toEqual({
      priceCents: 5000,
      durationMinutes: 30,
      priceSource: "service",
      durationSource: "service",
    });
  });

  it("uses only the specific price and keeps the default duration", () => {
    expect(
      resolveTerms(service, { priceCents: 6000, durationMinutes: null }),
    ).toEqual({
      priceCents: 6000,
      durationMinutes: 30,
      priceSource: "executor",
      durationSource: "service",
    });
  });

  it("uses only the specific duration and keeps the default price", () => {
    expect(
      resolveTerms(service, { priceCents: null, durationMinutes: 45 }),
    ).toEqual({
      priceCents: 5000,
      durationMinutes: 45,
      priceSource: "service",
      durationSource: "executor",
    });
  });

  it("uses both specific values", () => {
    expect(
      resolveTerms(service, { priceCents: 6000, durationMinutes: 45 }),
    ).toEqual({
      priceCents: 6000,
      durationMinutes: 45,
      priceSource: "executor",
      durationSource: "executor",
    });
  });

  it("treats a specific price of zero as a real value", () => {
    expect(
      resolveTerms(service, { priceCents: 0, durationMinutes: null }),
    ).toMatchObject({ priceCents: 0, priceSource: "executor" });
  });
});
