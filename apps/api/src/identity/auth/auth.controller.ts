import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { asc, eq } from "drizzle-orm";
import {
  LoginInput,
  type MeOutput,
  type SessionOutput,
} from "@barbearia/contracts";
import { ENV, type Env } from "../../config/config.module.js";
import { barbershop, unit, user } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { ApiError } from "../http/api-error.js";
import type { HttpResponse, AuthenticatedUser } from "../http/http-types.js";
import { ZodPipe } from "../http/zod.pipe.js";
import { AuthService } from "./auth.service.js";
import { clearCookie } from "./cookie.js";
import { Public, CurrentUser } from "./decorators.js";
import { respondWithSession } from "./session-http.js";

const invalidSession = (): ApiError =>
  new ApiError(
    401,
    "INVALID_SESSION",
    "Sessão inválida ou expirada. Entre novamente.",
  );

@Controller("auth")
export class AuthController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginInput)) input: LoginInput,
    @Res({ passthrough: true }) res: HttpResponse,
  ): Promise<SessionOutput> {
    const { user: loggedIn, token } = await this.auth.login(input);
    return respondWithSession(res, this.env, input.client, token, loggedIn);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Res({ passthrough: true }) res: HttpResponse,
  ): Promise<void> {
    if (current === undefined) {
      throw invalidSession();
    }
    await this.auth.logout(current);
    res.setHeader("Set-Cookie", clearCookie(this.env.secureCookie));
  }

  /** Who is logged in and their barbershop; RLS guarantees it is only their own. */
  @Get("me")
  eu(@CurrentUser() current: AuthenticatedUser | undefined): Promise<MeOutput> {
    if (current === undefined) {
      throw invalidSession();
    }
    return this.tenantDb.transaction(current.tenantId, async (tx) => {
      const [eu] = await tx
        .select()
        .from(user)
        .where(eq(user.id, current.userId));
      const [shop] = await tx.select().from(barbershop);
      const units = await tx.select().from(unit).orderBy(asc(unit.createdAt));
      if (eu === undefined || shop === undefined) {
        throw invalidSession();
      }
      return {
        user: {
          id: eu.id,
          name: eu.name,
          email: eu.email,
          role: eu.role,
          status: eu.status === "anonymized" ? "deactivated" : eu.status,
          barbershopId: eu.tenantId,
        },
        barbershop: {
          id: shop.id,
          name: shop.name,
          units: units.map((u) => ({
            id: u.id,
            name: u.name,
            timezone: u.timezone,
          })),
        },
      };
    });
  }
}
