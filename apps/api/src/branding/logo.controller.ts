import { Body, Controller, Delete, Headers, Put } from "@nestjs/common";
import type { Branding } from "@barbearia/contracts";
import { CurrentUser, Roles } from "../identity/auth/decorators.js";
import type { AuthenticatedUser } from "../identity/http/http-types.js";
import { requireUser } from "../identity/http/require-user.js";
import { LogoService } from "./logo.service.js";

/** Logo of the barbershop: raw PNG, JPEG or WebP bytes in the body, owner only (R6). */
@Controller("branding/logo")
export class LogoController {
  constructor(private readonly logo: LogoService) {}

  @Roles("owner")
  @Put()
  upload(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Body() body: unknown,
    @Headers("content-type") contentType: string | undefined,
  ): Promise<Branding> {
    // The raw parser only fills the body for image types; anything else arrives as `{}`.
    const bytes = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
    return this.logo.upload(requireUser(current), bytes, contentType);
  }

  @Roles("owner")
  @Delete()
  remove(
    @CurrentUser() current: AuthenticatedUser | undefined,
  ): Promise<Branding> {
    return this.logo.remove(requireUser(current));
  }
}
