export interface ServiceDefaults {
  priceCents: number;
  durationMinutes: number;
}

/** Specific values of an executor for a service; `null` means "use the default". */
export interface ExecutorOverrides {
  priceCents: number | null;
  durationMinutes: number | null;
}

export type TermSource = "executor" | "service";

export interface Terms {
  priceCents: number;
  durationMinutes: number;
  priceSource: TermSource;
  durationSource: TermSource;
}

/**
 * Price and duration that apply to one executor (FR-010). Each field is resolved on its own:
 * the specific value when present (zero included), otherwise the service default.
 */
export function resolveTerms(
  service: ServiceDefaults,
  link: ExecutorOverrides | null,
): Terms {
  const price = link?.priceCents ?? null;
  const duration = link?.durationMinutes ?? null;
  return {
    priceCents: price ?? service.priceCents,
    durationMinutes: duration ?? service.durationMinutes,
    priceSource: price === null ? "service" : "executor",
    durationSource: duration === null ? "service" : "executor",
  };
}
