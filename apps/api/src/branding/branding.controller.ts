import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Put,
} from "@nestjs/common";
import { UpdateBrandingInput, type Branding } from "@barbearia/contracts";
import { CurrentUser, Roles } from "../identity/auth/decorators.js";
import type { AuthenticatedUser } from "../identity/http/http-types.js";
import { requireUser } from "../identity/http/require-user.js";
import { ZodPipe } from "../identity/http/zod.pipe.js";
import { BrandingService } from "./branding.service.js";

/** Visual identity: any signed-in user reads, only the owner writes. */
@Controller("branding")
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  // A change must reach the next screen the colleagues open (FR-012): never cached.
  @Get()
  @Header("Cache-Control", "private, no-store")
  get(
    @CurrentUser() current: AuthenticatedUser | undefined,
  ): Promise<Branding> {
    return this.branding.get(requireUser(current));
  }

  @Roles("owner")
  @Put()
  update(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Body(new ZodPipe(UpdateBrandingInput)) input: UpdateBrandingInput,
  ): Promise<Branding> {
    return this.branding.update(requireUser(current), input);
  }

  @Roles("owner")
  @Post("reset")
  @HttpCode(200)
  reset(
    @CurrentUser() current: AuthenticatedUser | undefined,
  ): Promise<Branding> {
    return this.branding.reset(requireUser(current));
  }
}
