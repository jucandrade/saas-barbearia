import { z } from "zod";
import { Email, Name, Role, User } from "./common.js";

/** `GET /team`: users of the caller's own barbershop (without anonymized ones). */
export const TeamOutput = z.object({ users: z.array(User) });
export type TeamOutput = z.infer<typeof TeamOutput>;

/** `POST /team/invitations`. The role is set here and does not change later (FR-005). */
export const InviteInput = z.object({
  name: Name,
  email: Email,
  role: Role,
});
export type InviteInput = z.infer<typeof InviteInput>;

/**
 * `invitationSent` is `false` when the e-mail could not be sent: the invitation was
 * created and the owner can use "Reenviar convite".
 */
export const InviteOutput = z.object({
  user: User,
  invitationSent: z.boolean(),
});
export type InviteOutput = z.infer<typeof InviteOutput>;

/** `POST /team/{id}/resend-invitation`. */
export const ResendOutput = z.object({ invitationSent: z.boolean() });
export type ResendOutput = z.infer<typeof ResendOutput>;
