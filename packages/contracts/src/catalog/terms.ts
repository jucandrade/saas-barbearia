import { z } from "zod";
import { DurationMinutes, PriceCents } from "./common.js";

/** `GET /services/{id}/terms?userId=`: whose price and duration to resolve. */
export const TermsQuery = z.object({ userId: z.uuid() });
export type TermsQuery = z.infer<typeof TermsQuery>;

export const TermSource = z.enum(["executor", "service"]);
export type TermSource = z.infer<typeof TermSource>;

/** Price and duration that apply to an executor, and where each one comes from (FR-010). */
export const TermsOutput = z.object({
  priceCents: PriceCents,
  durationMinutes: DurationMinutes,
  priceSource: TermSource,
  durationSource: TermSource,
});
export type TermsOutput = z.infer<typeof TermsOutput>;
