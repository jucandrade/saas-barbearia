import { createHash, randomBytes } from "node:crypto";

/** Opaque 256-bit token, in base64url (fits in a URL and in a cookie). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the token hash goes to the database; the plain token is never stored. */
export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}
