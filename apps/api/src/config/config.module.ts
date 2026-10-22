import { Global, Module } from "@nestjs/common";
import { readEnv, type Env } from "./env.js";

export const ENV = Symbol("ENV");
export type { Env };

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => readEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
