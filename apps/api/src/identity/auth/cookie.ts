export const SESSION_COOKIE_NAME = "session";
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

/** Reads a cookie from the `Cookie` header, without a library. */
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const position = part.indexOf("=");
    if (position > 0 && part.slice(0, position).trim() === name) {
      return decodeURIComponent(part.slice(position + 1).trim());
    }
  }
  return undefined;
}

function attributes(secure: boolean): string {
  return `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The cookie lasts the maximum; the server decides the session's validity (R4). */
export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${String(THIRTY_DAYS_S)}; ${attributes(secure)}`;
}

export function clearCookie(secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; ${attributes(secure)}`;
}
