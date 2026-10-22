import { ApiError } from "./api-error.js";
import type { AuthenticatedUser } from "./http-types.js";

/** The session user of a protected route; the guard already ran, this narrows the type. */
export function requireUser(
  current: AuthenticatedUser | undefined,
): AuthenticatedUser {
  if (current === undefined) {
    throw new ApiError(
      401,
      "INVALID_SESSION",
      "Sessão inválida ou expirada. Entre novamente.",
    );
  }
  return current;
}
