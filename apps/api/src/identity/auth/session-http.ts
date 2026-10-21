import type { Client, User } from "@barbearia/contracts";
import type { Env } from "../../config/env.js";
import type { HttpResponse } from "../http/http-types.js";
import { sessionCookie } from "./cookie.js";

/**
 * Delivers the session to the client: `web` gets an `HttpOnly` cookie and no token in
 * the body; `mobile` gets the token in the body, to keep in secure storage (R4).
 */
export function respondWithSession(
  res: HttpResponse,
  env: Env,
  client: Client,
  token: string,
  user: User,
): { user: User; token?: string } {
  if (client === "web") {
    res.setHeader("Set-Cookie", sessionCookie(token, env.secureCookie));
    return { user };
  }
  return { user, token };
}
