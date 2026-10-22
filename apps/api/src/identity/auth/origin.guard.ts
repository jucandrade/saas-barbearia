import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ENV, type Env } from "../../config/config.module.js";
import { ApiError } from "../http/api-error.js";
import type { HttpRequest } from "../http/http-types.js";
import { readCookie, SESSION_COOKIE_NAME } from "./cookie.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF protection for cookie sessions: a state-changing request that
 * carries the cookie must come from the admin origin. The mobile app uses
 * `Bearer` and is not affected.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<HttpRequest>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return true;
    }
    const header = req.headers["cookie"];
    const cookie = Array.isArray(header) ? header[0] : header;
    if (readCookie(cookie, SESSION_COOKIE_NAME) === undefined) {
      return true;
    }
    const origin = req.headers["origin"];
    if (
      (Array.isArray(origin) ? origin[0] : origin) !== this.env.adminBaseUrl
    ) {
      throw new ApiError(
        403,
        "INVALID_ORIGIN",
        "Origem da requisição não permitida.",
      );
    }
    return true;
  }
}
