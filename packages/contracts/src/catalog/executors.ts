import { z } from "zod";
import { DurationMinutes, PriceCents } from "./common.js";

/**
 * `PUT /services/{id}/executors/{userId}`: links the user to the service. Specific price and
 * duration are optional; `null` goes back to the service default (FR-009).
 */
export const ExecutorInput = z.object({
  priceCents: PriceCents.nullable().optional(),
  durationMinutes: DurationMinutes.nullable().optional(),
});
export type ExecutorInput = z.infer<typeof ExecutorInput>;

/**
 * Someone who performs a service. The specific values are left out when the caller is a barber
 * looking at a colleague; the e-mail is never part of it (FR-011).
 */
export const Executor = z.object({
  userId: z.uuid(),
  /** User names go up to 120 characters (identity), more than a service name. */
  name: z.string().min(1).max(120),
  priceCents: PriceCents.nullable().optional(),
  durationMinutes: DurationMinutes.nullable().optional(),
});
export type Executor = z.infer<typeof Executor>;

/** `GET /services/{id}/executors`. */
export const ExecutorsOutput = z.object({ executors: z.array(Executor) });
export type ExecutorsOutput = z.infer<typeof ExecutorsOutput>;
