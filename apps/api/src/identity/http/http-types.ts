import type { Role } from "@barbearia/domain";

/** Only what the code uses from Express, so it does not depend on its types. */
export interface HttpRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  route?: { path?: string };
  authenticated?: AuthenticatedUser;
}

export interface HttpResponse {
  status(code: number): HttpResponse;
  setHeader(name: string, value: string | string[]): unknown;
  json(body: unknown): unknown;
}

export interface AuthenticatedUser {
  sessionId: string;
  userId: string;
  tenantId: string;
  role: Role;
}
