import { describe, expect, it } from "vitest";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_DURATION_MINUTES,
  MAX_NAME_LENGTH,
  MAX_PRICE_CENTS,
  validateCategoryName,
  validateDescription,
  validateDuration,
  validatePrice,
  validateServiceName,
} from "../../src/catalog/validation.js";

describe("validateDuration", () => {
  it.each([5, 30, 45, 480])("accepts %i minutes", (minutes) => {
    expect(validateDuration(minutes)).toEqual({ ok: true, value: minutes });
  });

  it.each([0, -5, 4, 485, 600])("rejects %i as out of range", (minutes) => {
    expect(validateDuration(minutes)).toEqual({
      ok: false,
      reason: "out_of_range",
    });
  });

  it.each([37, 11, 479])("rejects %i as not a multiple of the step", (m) => {
    expect(validateDuration(m)).toEqual({
      ok: false,
      reason: "not_multiple_of_step",
    });
  });

  it.each([30.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %s as not an integer",
    (minutes) => {
      expect(validateDuration(minutes)).toEqual({
        ok: false,
        reason: "not_integer",
      });
    },
  );

  it("exposes the upper limit", () => {
    expect(MAX_DURATION_MINUTES).toBe(480);
  });
});

describe("validatePrice", () => {
  it.each([0, 1, 4500, MAX_PRICE_CENTS])("accepts %i cents", (cents) => {
    expect(validatePrice(cents)).toEqual({ ok: true, value: cents });
  });

  it.each([-1, MAX_PRICE_CENTS + 1])("rejects %i as out of range", (cents) => {
    expect(validatePrice(cents)).toEqual({ ok: false, reason: "out_of_range" });
  });

  it.each([10.5, Number.NaN])("rejects %s as not an integer", (cents) => {
    expect(validatePrice(cents)).toEqual({ ok: false, reason: "not_integer" });
  });

  it("caps the price at R$ 10.000,00", () => {
    expect(MAX_PRICE_CENTS).toBe(1_000_000);
  });
});

describe.each([
  ["validateServiceName", validateServiceName],
  ["validateCategoryName", validateCategoryName],
])("%s", (_title, validate) => {
  it("accepts 1 to 80 characters and returns the trimmed name", () => {
    expect(validate("  Corte  ")).toEqual({ ok: true, value: "Corte" });
    expect(validate("a".repeat(MAX_NAME_LENGTH))).toEqual({
      ok: true,
      value: "a".repeat(MAX_NAME_LENGTH),
    });
  });

  it("rejects empty and whitespace-only names", () => {
    expect(validate("")).toEqual({ ok: false, reason: "empty" });
    expect(validate("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects 81 characters", () => {
    expect(validate("a".repeat(MAX_NAME_LENGTH + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });
});

describe("validateDescription", () => {
  it("accepts up to 500 characters", () => {
    const text = "x".repeat(MAX_DESCRIPTION_LENGTH);
    expect(validateDescription(text)).toEqual({ ok: true, value: text });
  });

  it("turns empty, blank, null and undefined into null", () => {
    expect(validateDescription("")).toEqual({ ok: true, value: null });
    expect(validateDescription("   ")).toEqual({ ok: true, value: null });
    expect(validateDescription(null)).toEqual({ ok: true, value: null });
    expect(validateDescription(undefined)).toEqual({ ok: true, value: null });
  });

  it("rejects 501 characters", () => {
    expect(validateDescription("x".repeat(MAX_DESCRIPTION_LENGTH + 1))).toEqual(
      { ok: false, reason: "too_long" },
    );
  });
});
