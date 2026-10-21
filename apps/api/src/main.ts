import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { readEnv } from "./config/env.js";

async function bootstrap(): Promise<void> {
  const env = readEnv();
  const app = await NestFactory.create(AppModule);
  // The admin (another port) calls the API with the session cookie: it needs CORS with credentials.
  app.enableCors({ origin: env.adminBaseUrl, credentials: true });
  await app.listen(env.port);
}

void bootstrap();
