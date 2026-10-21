import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import type { Role } from "@barbearia/domain";
import type { HttpRequest, AuthenticatedUser } from "../http/http-types.js";

export const PUBLIC = "identity:public";
export const ROLES = "identity:roles";

/** Route that does not require a session (login, invitation, recovery, health). */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC, true);

/** Restricts the route to one or more roles; others get `403 NO_PERMISSION`. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES, roles);

/** User, role and barbershop of the current session. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<HttpRequest>().authenticated,
);
