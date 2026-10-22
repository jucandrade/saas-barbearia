import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { CatalogAuditService } from "./catalog-audit.service.js";
import { CatalogFacade } from "./catalog.facade.js";
import { CategoriesController } from "./categories/categories.controller.js";
import { CategoriesService } from "./categories/categories.service.js";
import { ExecutorsController } from "./executors/executors.controller.js";
import { ExecutorsService } from "./executors/executors.service.js";
import { ServicesController } from "./services/services.controller.js";
import { ServicesService } from "./services/services.service.js";

/**
 * Bounded context "Cadastros" (catalog of services, principle VI). It reads users only
 * through the Identity context's `UserDirectory` and never touches its tables. The HTTP kit
 * (guards, pipes, `ApiError`, error filter) comes from Identity as shared code (R1).
 */
@Module({
  imports: [IdentityModule],
  controllers: [CategoriesController, ServicesController, ExecutorsController],
  providers: [
    CatalogAuditService,
    CategoriesService,
    ServicesService,
    ExecutorsService,
    CatalogFacade,
  ],
  exports: [CatalogAuditService, CatalogFacade],
})
export class CatalogModule {}
