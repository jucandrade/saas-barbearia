import {
  ResendOutput,
  ServicesOutput,
  TeamOutput,
  type Service,
  type User,
} from "@barbearia/contracts";
import { ApiResponseError, call, callWithoutResponse } from "./api";

/** Shown when the phone cannot reach the server: nothing was changed (spec edge case). */
export const NEEDS_CONNECTION = "Esta ação precisa de conexão.";

const ERROR_MESSAGES: Record<string, string> = {
  LAST_OWNER: "A barbearia precisa de pelo menos um dono ativo.",
  NO_PERMISSION: "Só donos podem fazer isso.",
  NOT_FOUND: "Isso não existe mais. Atualize a tela.",
};

/** Message for the owner; a failed connection says that the action needs one. */
export function ownerMessage(error: unknown): string {
  if (error instanceof ApiResponseError) {
    if (error.code === "NO_CONNECTION") {
      return NEEDS_CONNECTION;
    }
    return ERROR_MESSAGES[error.code] ?? error.message;
  }
  return "Algo deu errado. Tente de novo.";
}

/** An expired or revoked session (the owner's lasts 12 hours without use, FR-022). */
export function isSessionGone(error: unknown): boolean {
  return error instanceof ApiResponseError && error.status === 401;
}

export async function listServices(token: string): Promise<Service[]> {
  const output = await call("/services", { token, schema: ServicesOutput });
  return output.services;
}

export function setServiceActive(
  token: string,
  service: Service,
  active: boolean,
): Promise<void> {
  return callWithoutResponse(
    `/services/${service.id}/${active ? "reactivate" : "deactivate"}`,
    token,
  );
}

export async function listTeam(token: string): Promise<User[]> {
  const output = await call("/team", { token, schema: TeamOutput });
  return output.users;
}

export function deactivateMember(token: string, user: User): Promise<void> {
  return callWithoutResponse(`/team/${user.id}/deactivate`, token);
}

export async function resendInvitation(
  token: string,
  user: User,
): Promise<boolean> {
  const output = await call(`/team/${user.id}/resend-invitation`, {
    method: "POST",
    token,
    schema: ResendOutput,
  });
  return output.invitationSent;
}
