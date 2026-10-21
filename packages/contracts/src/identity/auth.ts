import { z } from "zod";
import { Client, Email, User } from "./common.js";

export const UnitOutput = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  timezone: z.string().min(1),
});
export type UnitOutput = z.infer<typeof UnitOutput>;

/** `GET /auth/me`: who is signed in and their barbershop (only their own). */
export const MeOutput = z.object({
  user: User,
  barbershop: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    units: z.array(UnitOutput),
  }),
});
export type MeOutput = z.infer<typeof MeOutput>;

/** `POST /auth/login`. The success response is `SessionOutput` (invitation.ts). */
export const LoginInput = z.object({
  email: Email,
  password: z.string().min(1).max(256),
  client: Client,
});
export type LoginInput = z.infer<typeof LoginInput>;
