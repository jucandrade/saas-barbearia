import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { BrandingAuditService } from "./branding-audit.service.js";
import { BrandingController } from "./branding.controller.js";
import { BrandingService } from "./branding.service.js";
import { PublicBrandingController } from "./public-branding.controller.js";
import { PublicBrandingService } from "./public-branding.service.js";
import { LogoController } from "./logo.controller.js";
import { LogoService } from "./logo.service.js";

/**
 * Bounded context "Identity and Tenancy", visual identity of the barbershop (principle VI).
 * It reads and renames the barbershop only through the Identity port `BarbershopDirectory`
 * and owns three tables of its own. The HTTP kit (guards, pipes, `ApiError`, error filter)
 * comes from Identity as shared code, as in the catalog (R1).
 */
@Module({
  imports: [IdentityModule],
  controllers: [BrandingController, LogoController, PublicBrandingController],
  providers: [
    BrandingAuditService,
    BrandingService,
    LogoService,
    PublicBrandingService,
  ],
  exports: [BrandingAuditService, BrandingService],
})
export class BrandingModule {}
