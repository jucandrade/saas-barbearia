import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthModule } from "./health/health.module.js";
import { IdentityModule } from "./identity/identity.module.js";

@Module({
  imports: [
    ConfigModule,
    DbModule,
    IdentityModule,
    CatalogModule,
    HealthModule,
  ],
})
export class AppModule {}
