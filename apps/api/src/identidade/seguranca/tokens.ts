import { createHash, randomBytes } from "node:crypto";

/** Token opaco de 256 bits, em base64url (cabe em URL e em cookie). */
export function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Só o hash do token vai para o banco; o token em claro nunca é guardado. */
export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}
