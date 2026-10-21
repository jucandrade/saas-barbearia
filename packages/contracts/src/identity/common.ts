import { z } from "zod";

export const Role = z.enum(["owner", "barber"]);
export type Role = z.infer<typeof Role>;

/** Statuses visible through the API; `anonymized` is never exposed. */
export const Status = z.enum(["invited", "active", "deactivated"]);
export type Status = z.infer<typeof Status>;

/** E-mail trimmed and lowercased, as it is stored and compared (FR-006). */
export const Email = z.string().trim().toLowerCase().pipe(z.email());
export type Email = z.infer<typeof Email>;

export const Name = z.string().trim().min(1).max(120);

export const Client = z.enum(["web", "mobile"]);
export type Client = z.infer<typeof Client>;

/** User as the API returns it: without password hash, tokens or counters. */
export const User = z.object({
  id: z.uuid(),
  name: Name,
  email: Email,
  role: Role,
  status: Status,
  barbershopId: z.uuid(),
});
export type User = z.infer<typeof User>;

/** Error format of every route (contracts/api.md, Conventions). */
export const ErrorBody = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  fields: z.record(z.string(), z.string()).optional(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;
