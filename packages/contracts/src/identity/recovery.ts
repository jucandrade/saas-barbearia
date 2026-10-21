import { z } from "zod";
import { Email } from "./common.js";

/** `POST /auth/password/forgot`. */
export const ForgotInput = z.object({ email: Email });
export type ForgotInput = z.infer<typeof ForgotInput>;

/** The same response whether or not the account exists (FR-014). */
export const ForgotOutput = z.object({ message: z.string().min(1) });
export type ForgotOutput = z.infer<typeof ForgotOutput>;

export const RECOVERY_MESSAGE =
  "Se o e-mail estiver cadastrado, enviaremos as instruções.";

/** `POST /auth/password/reset`. The password policy is applied by the server (domain). */
export const ResetInput = z.object({
  token: z.string().min(1).max(256),
  password: z.string().min(1).max(256),
});
export type ResetInput = z.infer<typeof ResetInput>;
