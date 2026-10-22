import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { CatalogAuditService } from "./catalog-audit.service.js";

/**
 * Bounded context "Cadastros" (catalog of services, principle VI). It reads users only
 * through the Identity context's `UserDirectory` and never touches its tables. The HTTP kit
 * (guards, pipes, `ApiError`, error filter) comes from Identity as shared code (R1).
 */
@Module({
  imports: [IdentityModule],
  providers: [CatalogAuditService],
  exports: [CatalogAuditService],
})
export class CatalogModule {}
