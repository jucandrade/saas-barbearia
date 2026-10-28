import { describe, expect, it } from "vitest";
import {
  isValidSlug,
  MAX_SLUG_LENGTH,
  MIN_SLUG_LENGTH,
  slugify,
  withSuffix,
} from "../../src/branding/slug.js";

const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("slugify", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugify("Barbearia do Billy")).toBe("barbearia-do-billy");
  });

  it("removes accents", () => {
    expect(slugify("Corte e Barba São João")).toBe("corte-e-barba-sao-joao");
  });

  it("drops apostrophes instead of splitting the word", () => {
    expect(slugify("Tribo's Barbershop")).toBe("tribos-barbershop");
    expect(slugify("Tribo’s Barbershop")).toBe("tribos-barbershop");
  });

  it("collapses spaces and symbols into a single hyphen and trims the ends", () => {
    expect(slugify("  --Corte &  Barba!!  ")).toBe("corte-barba");
  });

  it("limits the result to 40 characters without ending in a hyphen", () => {
    const slug = slugify("a".repeat(39) + " bbbbbbbb");
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe("a".repeat(39));
  });

  it("prefixes results shorter than 3 characters", () => {
    expect(slugify("A")).toBe("barbearia-a");
    expect(slugify("ab")).toBe("barbearia-ab");
  });

  it("falls back to a fixed slug when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("barbearia");
    expect(slugify("")).toBe("barbearia");
  });

  it.each([
    "Barbearia do Billy",
    "ÁÉÍÓÚ çÇ ãõ",
    "!!!",
    "A",
    "x".repeat(200),
    "Barba & Cia. (Centro) #1",
  ])("always produces a valid slug for %j", (name) => {
    const slug = slugify(name);
    expect(slug).toMatch(SLUG_FORMAT);
    expect(slug.length).toBeGreaterThanOrEqual(MIN_SLUG_LENGTH);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
  });
});

describe("withSuffix", () => {
  it("appends the number after a hyphen", () => {
    expect(withSuffix("barbearia-do-billy", 2)).toBe("barbearia-do-billy-2");
  });

  it("truncates the base so the total stays within 40 characters", () => {
    const slug = withSuffix("a".repeat(40), 12);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith("-12")).toBe(true);
    expect(slug).toMatch(SLUG_FORMAT);
  });

  it("does not leave a double hyphen when the base is cut at a hyphen", () => {
    const slug = withSuffix("a".repeat(37) + "-bb", 2);
    expect(slug).toMatch(SLUG_FORMAT);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
  });
});

describe("isValidSlug", () => {
  it.each(["abc", "barbearia-do-billy", "a1-b2", "x".repeat(40)])(
    "accepts %s",
    (slug) => {
      expect(isValidSlug(slug)).toBe(true);
    },
  );

  it.each([
    "",
    "ab",
    "x".repeat(41),
    "Upper",
    "-start",
    "end-",
    "a--b",
    "a_b",
    "a b",
    "../x",
    "ação",
  ])("rejects %j", (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });

  it("accepts every slug that slugify produces", () => {
    for (const name of ["Barbearia do Billy", "!!!", "A", "Tribo's"]) {
      expect(isValidSlug(slugify(name))).toBe(true);
    }
  });
});
