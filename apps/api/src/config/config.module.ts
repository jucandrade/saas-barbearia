import { Global, Module } from "@nestjs/common";
import { lerEnv, type Env } from "./env.js";

export const ENV = Symbol("ENV");
export type { Env };

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => lerEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
