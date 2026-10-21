import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import pg from "pg";
import { ENV, type Env } from "../config/config.module.js";
import { POOL, TenantDb } from "./tenant-db.js";

@Global()
@Module({
  providers: [
    {
      provide: POOL,
      inject: [ENV],
      useFactory: (env: Env): pg.Pool =>
        new pg.Pool({ connectionString: env.databaseUrl }),
    },
    TenantDb,
  ],
  exports: [POOL, TenantDb],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
