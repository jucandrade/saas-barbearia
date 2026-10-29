import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { configureApp } from "./app-setup.js";
import { readEnv } from "./config/env.js";

async function bootstrap(): Promise<void> {
  const env = readEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app, env);
  await app.listen(env.port);
}

void bootstrap();
