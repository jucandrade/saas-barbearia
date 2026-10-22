import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@barbearia/domain";
import { ApiError } from "../http/api-error.js";
import type { HttpRequest } from "../http/http-types.js";
import { readCookie, SESSION_COOKIE_NAME } from "./cookie.js";
import { ROLES, PUBLIC } from "./decorators.js";
import { SessionService } from "./session.service.js";

function valueOf(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

/** Extracts the session token: `Authorization: Bearer` (mobile) or cookie (web). */
export function tokenFromRequest(req: HttpRequest): string | undefined {
  const authorization = valueOf(req.headers["authorization"]);
  if (authorization?.startsWith("Bearer ") === true) {
    return authorization.slice("Bearer ".length).trim();
  }
  return readCookie(valueOf(req.headers["cookie"]), SESSION_COOKIE_NAME);
}

/** Global guard: every route requires a valid session, except those marked `@Public()`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC, targets) ===
      true
    ) {
      return true;
    }

    const req = context.switchToHttp().getRequest<HttpRequest>();
    const token = tokenFromRequest(req);
    const session =
      token === undefined || token === ""
        ? undefined
        : await this.sessions.resolve(token);
    if (session === undefined) {
      throw new ApiError(
        401,
        "INVALID_SESSION",
        "Sessão inválida ou expirada. Entre novamente.",
      );
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES,
      targets,
    );
    if (roles !== undefined && !roles.includes(session.role)) {
      throw new ApiError(
        403,
        "NO_PERMISSION",
        "Você não tem permissão para esta ação.",
      );
    }

    req.authenticated = session;
    return true;
  }
}
