import { NestFactory } from "@nestjs/core";
import { AnonymizationService } from "../identity/provisioning/anonymization.service.js";
import { ProvisioningService } from "../identity/provisioning/provisioning.service.js";
import { OwnerInvitationResendService } from "../identity/provisioning/owner-invitation-resend.service.js";
import { runCli } from "./commands.js";
import { CliModule } from "./cli.module.js";

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CliModule, {
    logger: ["error", "warn"],
  });
  try {
    process.exitCode = await runCli(
      process.argv.slice(2),
      {
        provisioning: app.get(ProvisioningService),
        resend: app.get(OwnerInvitationResendService),
        anonymization: app.get(AnonymizationService),
      },
      {
        out: (message) => {
          console.log(message);
        },
        err: (message) => {
          console.error(message);
        },
      },
    );
  } finally {
    await app.close();
  }
}

void main();
