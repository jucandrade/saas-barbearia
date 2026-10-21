import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(Number(process.env["PORT"] ?? DEFAULT_PORT));
}

void bootstrap();
