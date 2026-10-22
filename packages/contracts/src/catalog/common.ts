import { z } from "zod";
import {
  DURATION_STEP_MINUTES,
  MAX_DESCRIPTION_LENGTH,
  MAX_DURATION_MINUTES,
  MAX_NAME_LENGTH,
  MAX_PRICE_CENTS,
  MIN_DURATION_MINUTES,
  validateDuration,
  validatePrice,
} from "@barbearia/domain";

/** Name of a service or category: trimmed, 1 to 80 characters (FR-001, FR-018). */
export const CatalogName = z
  .string()
  .trim()
  .min(1, "Informe o nome.")
  .max(MAX_NAME_LENGTH, `Use até ${String(MAX_NAME_LENGTH)} caracteres.`);

/** Description: optional, up to 500 characters; blank means "none" (FR-001). */
export const ServiceDescription = z
  .string()
  .trim()
  .max(
    MAX_DESCRIPTION_LENGTH,
    `Use até ${String(MAX_DESCRIPTION_LENGTH)} caracteres.`,
  );

/** Whole minutes, multiple of 5, from 5 to 480 (FR-003). */
export const DurationMinutes = z.number().superRefine((minutes, ctx) => {
  const result = validateDuration(minutes);
  if (result.ok) return;
  ctx.addIssue({
    code: "custom",
    message:
      result.reason === "not_multiple_of_step"
        ? `A duração deve ser múltipla de ${String(DURATION_STEP_MINUTES)} minutos.`
        : `A duração deve ficar entre ${String(MIN_DURATION_MINUTES)} e ${String(MAX_DURATION_MINUTES)} minutos.`,
  });
});
export type DurationMinutes = z.infer<typeof DurationMinutes>;

/** Whole cents, from 0 to R$ 10.000,00 (FR-003, constitution II). */
export const PriceCents = z.number().superRefine((cents, ctx) => {
  if (validatePrice(cents).ok) return;
  ctx.addIssue({
    code: "custom",
    message: `O preço deve ser um valor em centavos entre 0 e ${String(MAX_PRICE_CENTS)}.`,
  });
});
export type PriceCents = z.infer<typeof PriceCents>;

export const ServiceStatus = z.enum(["active", "deactivated"]);
export type ServiceStatus = z.infer<typeof ServiceStatus>;

export const ServiceCategory = z.object({
  id: z.uuid(),
  name: CatalogName,
  position: z.number().int().min(0),
});
export type ServiceCategory = z.infer<typeof ServiceCategory>;

/** Price and duration that apply to someone, and where each one came from. */
export const Terms = z.object({
  priceCents: PriceCents,
  durationMinutes: DurationMinutes,
});
export type Terms = z.infer<typeof Terms>;

/** Stable error codes added by the catalog (contracts/api.md, Conventions). */
export const CATALOG_ERROR_CODES = [
  "SERVICE_NAME_TAKEN",
  "CATEGORY_NAME_TAKEN",
  "CATEGORY_NOT_EMPTY",
  "INVALID_ORDER",
  "EXECUTOR_NOT_ELIGIBLE",
] as const;
export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number];
