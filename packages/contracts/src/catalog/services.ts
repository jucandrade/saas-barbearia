import { z } from "zod";
import {
  CatalogName,
  DurationMinutes,
  PriceCents,
  ServiceDescription,
  ServiceStatus,
  Terms,
} from "./common.js";

/**
 * A service as the API returns it. `priceCents` and `durationMinutes` are the defaults;
 * `effective` is what applies to the caller (their specific values when `mine` and set).
 * `executorCount` is for owners only and counts active executors.
 */
export const Service = z.object({
  id: z.uuid(),
  name: CatalogName,
  description: z.string().nullable(),
  categoryId: z.uuid(),
  priceCents: PriceCents,
  durationMinutes: DurationMinutes,
  status: ServiceStatus,
  mine: z.boolean(),
  effective: Terms,
  executorCount: z.number().int().min(0).optional(),
});
export type Service = z.infer<typeof Service>;

/** `GET /services`. */
export const ServicesOutput = z.object({ services: z.array(Service) });
export type ServicesOutput = z.infer<typeof ServicesOutput>;

/** `GET /services?status=`: owners filter by status (default `all`); barbers always get `active`. */
export const ServiceListQuery = z.object({
  status: z.enum(["active", "deactivated", "all"]).optional(),
});
export type ServiceListQuery = z.infer<typeof ServiceListQuery>;

/** `POST /services`. */
export const CreateServiceInput = z.object({
  name: CatalogName,
  description: ServiceDescription.optional(),
  categoryId: z.uuid(),
  priceCents: PriceCents,
  durationMinutes: DurationMinutes,
});
export type CreateServiceInput = z.infer<typeof CreateServiceInput>;

/** `PATCH /services/{id}`: only the sent fields change; `description: null` clears it. */
export const UpdateServiceInput = z
  .object({
    name: CatalogName,
    description: ServiceDescription.nullable(),
    categoryId: z.uuid(),
    priceCents: PriceCents,
    durationMinutes: DurationMinutes,
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo.",
  });
export type UpdateServiceInput = z.infer<typeof UpdateServiceInput>;
