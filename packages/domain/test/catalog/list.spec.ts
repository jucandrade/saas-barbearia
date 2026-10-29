import { describe, expect, it } from "vitest";
import {
  filterServices,
  sortServices,
  type ListableService,
} from "../../src/catalog/list.js";

function row(overrides: Partial<ListableService> & { name: string }) {
  return {
    categoryName: "Cabelo",
    durationMinutes: 30,
    priceCents: 5000,
    status: "active" as const,
    executorCount: 1,
    ...overrides,
  };
}

const corte = row({ name: "Corte", priceCents: 5000, durationMinutes: 30 });
const barba = row({
  name: "Barba",
  categoryName: "Barba",
  priceCents: 3500,
  durationMinutes: 30,
});
const combo = row({
  name: "Corte + Barba",
  priceCents: 8000,
  durationMinutes: 60,
  executorCount: 0,
});
const sobrancelha = row({
  name: "Sobrancelha",
  categoryName: "Estética",
  priceCents: 1500,
  durationMinutes: 15,
  status: "deactivated",
  executorCount: 0,
});
const all = [corte, barba, combo, sobrancelha];

describe("filterServices", () => {
  it("keeps everything by default", () => {
    expect(filterServices(all, {})).toEqual(all);
    expect(filterServices(all, { status: "all" })).toEqual(all);
  });

  it("filters by status", () => {
    expect(filterServices(all, { status: "active" })).toEqual([
      corte,
      barba,
      combo,
    ]);
    expect(filterServices(all, { status: "deactivated" })).toEqual([
      sobrancelha,
    ]);
  });

  it("keeps only services without an executor", () => {
    expect(filterServices(all, { withoutExecutor: true })).toEqual([
      combo,
      sobrancelha,
    ]);
  });

  it("combines status and without-executor", () => {
    expect(
      filterServices(all, { status: "active", withoutExecutor: true }),
    ).toEqual([combo]);
    expect(
      filterServices(all, { status: "deactivated", withoutExecutor: true }),
    ).toEqual([sobrancelha]);
  });

  it("returns an empty list for an empty list and does not change the input", () => {
    expect(filterServices([], { status: "active" })).toEqual([]);
    const copy = [...all];
    filterServices(all, { status: "active" });
    expect(all).toEqual(copy);
  });
});

describe("sortServices", () => {
  const names = (list: ListableService[]) => list.map((s) => s.name);

  it("sorts by name in both directions, using Portuguese collation", () => {
    const accented = [
      row({ name: "Álcool" }),
      row({ name: "Zebra" }),
      row({ name: "Amora" }),
    ];
    expect(
      names(sortServices(accented, { by: "name", direction: "asc" })),
    ).toEqual(["Álcool", "Amora", "Zebra"]);
    expect(
      names(sortServices(accented, { by: "name", direction: "desc" })),
    ).toEqual(["Zebra", "Amora", "Álcool"]);
  });

  it("sorts by category name, ties broken by service name", () => {
    expect(
      names(sortServices(all, { by: "category", direction: "asc" })),
    ).toEqual(["Barba", "Corte", "Corte + Barba", "Sobrancelha"]);
  });

  it("sorts by duration", () => {
    expect(
      names(sortServices(all, { by: "duration", direction: "asc" })),
    ).toEqual(["Sobrancelha", "Barba", "Corte", "Corte + Barba"]);
    expect(
      names(sortServices(all, { by: "duration", direction: "desc" }))[0],
    ).toBe("Corte + Barba");
  });

  it("sorts by price, ties broken by name", () => {
    const tied = [
      row({ name: "B", priceCents: 100 }),
      row({ name: "A", priceCents: 100 }),
    ];
    expect(
      names(sortServices(tied, { by: "price", direction: "asc" })),
    ).toEqual(["A", "B"]);
    expect(
      names(sortServices(all, { by: "price", direction: "desc" })),
    ).toEqual(["Corte + Barba", "Corte", "Barba", "Sobrancelha"]);
  });

  it("does not change the original list and handles an empty one", () => {
    const copy = [...all];
    sortServices(all, { by: "price", direction: "desc" });
    expect(all).toEqual(copy);
    expect(sortServices([], { by: "name", direction: "asc" })).toEqual([]);
  });
});
