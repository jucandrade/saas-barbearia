import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { lerEnv } from "./config/env.js";

async function bootstrap(): Promise<void> {
  const env = lerEnv();
  const app = await NestFactory.create(AppModule);
  // O admin (outra porta) chama a API com o cookie de sessão: precisa de CORS com credenciais.
  app.enableCors({ origin: env.adminBaseUrl, credentials: true });
  await app.listen(env.porta);
}

void bootstrap();
