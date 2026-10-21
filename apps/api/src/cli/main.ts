import { NestFactory } from "@nestjs/core";
import { ProvisionamentoService } from "../identidade/provisionamento/provisionamento.service.js";
import { ReenvioConviteDonoService } from "../identidade/provisionamento/reenvio-convite-dono.service.js";
import { executarCli } from "./comandos.js";
import { CliModule } from "./cli.module.js";

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CliModule, {
    logger: ["error", "warn"],
  });
  try {
    process.exitCode = await executarCli(
      process.argv.slice(2),
      {
        provisionamento: app.get(ProvisionamentoService),
        reenvio: app.get(ReenvioConviteDonoService),
      },
      {
        out: (mensagem) => {
          console.log(mensagem);
        },
        err: (mensagem) => {
          console.error(mensagem);
        },
      },
    );
  } finally {
    await app.close();
  }
}

void main();
