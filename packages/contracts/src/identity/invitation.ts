import { z } from "zod";
import { Client, Email, Name, User } from "./common.js";

/** `GET /auth/invitations/{token}`: what the screen shows before asking for the password. */
export const InvitationInfo = z.object({
  name: Name,
  barbershop: z.string().min(1),
});
export type InvitationInfo = z.infer<typeof InvitationInfo>;

/** `POST /auth/invitations/accept`. The password policy is applied by the server (domain). */
export const AcceptInvitationInput = z.object({
  token: z.string().min(1).max(256),
  password: z.string().min(1).max(256),
  client: Client,
});
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationInput>;

/** For `web` the session goes in a cookie and `token` does not exist; for `mobile` it comes in the body. */
export const SessionOutput = z.object({
  user: User,
  token: z.string().min(1).optional(),
});
export type SessionOutput = z.infer<typeof SessionOutput>;

/** Product-team command (no HTTP route): provision a barbershop. */
export const ProvisionBarbershopCommand = z.object({
  name: Name,
  unit: Name,
  timezone: z.string().trim().min(1),
  ownerName: Name,
  ownerEmail: Email,
});
export type ProvisionBarbershopCommand = z.infer<
  typeof ProvisionBarbershopCommand
>;
