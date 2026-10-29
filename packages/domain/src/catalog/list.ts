/** What the Catalog table needs from a service to filter and sort it (FR-016). */
export interface ListableService {
  name: string;
  categoryName: string;
  durationMinutes: number;
  priceCents: number;
  status: "active" | "deactivated";
  /** Active executors; `0` marks a service nobody can perform. */
  executorCount: number;
}

export interface ServiceFilter {
  /** Defaults to all. */
  status?: "active" | "deactivated" | "all";
  /** Keep only services without an executor. */
  withoutExecutor?: boolean;
}

export type ServiceSortKey = "name" | "category" | "duration" | "price";

export interface ServiceSort {
  by: ServiceSortKey;
  direction: "asc" | "desc";
}

/** Filters the Catalog by status and by "no executor". Never changes the input. */
export function filterServices<T extends ListableService>(
  services: readonly T[],
  filter: ServiceFilter,
): T[] {
  const status = filter.status ?? "all";
  return services.filter(
    (service) =>
      (status === "all" || service.status === status) &&
      (filter.withoutExecutor !== true || service.executorCount === 0),
  );
}

const compareText = (a: string, b: string): number =>
  a.localeCompare(b, "pt-BR");

/**
 * Sorts the Catalog by name, category, duration or price (FR-016). Text uses Portuguese
 * collation; ties fall back to the name, so the order is stable. Never changes the input.
 */
export function sortServices<T extends ListableService>(
  services: readonly T[],
  sort: ServiceSort,
): T[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const compare = (a: T, b: T): number => {
    switch (sort.by) {
      case "name":
        return compareText(a.name, b.name);
      case "category":
        return (
          compareText(a.categoryName, b.categoryName) ||
          compareText(a.name, b.name)
        );
      case "duration":
        return (
          a.durationMinutes - b.durationMinutes || compareText(a.name, b.name)
        );
      case "price":
        return a.priceCents - b.priceCents || compareText(a.name, b.name);
    }
  };
  return [...services].sort((a, b) => sign * compare(a, b));
}
