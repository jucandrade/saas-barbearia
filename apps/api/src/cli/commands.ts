import { parseArgs } from "node:util";
import { ProvisionBarbershopCommand } from "@barbearia/contracts";
import { PlatformError } from "../identity/provisioning/platform-error.js";
import type { AnonymizationService } from "../identity/provisioning/anonymization.service.js";
import type { ProvisioningService } from "../identity/provisioning/provisioning.service.js";
import type { OwnerInvitationResendService } from "../identity/provisioning/owner-invitation-resend.service.js";

export interface CliOutput {
  out(message: string): void;
  err(message: string): void;
}

export interface CliDeps {
  provisioning: Pick<ProvisioningService, "provision">;
  resend: Pick<OwnerInvitationResendService, "resend">;
  anonymization: Pick<AnonymizationService, "anonymize">;
}

type Command = (
  args: string[],
  deps: CliDeps,
  io: CliOutput,
) => Promise<number>;

const EXIT_FAILURE = 1;
const EXIT_UNEXPECTED_ERROR = 2;
const EXIT_INVITATION_NOT_SENT = 3;

/** Only the error type: a database failure message may carry personal data. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

async function guarded(
  io: CliOutput,
  execution: () => Promise<number>,
): Promise<number> {
  try {
    return await execution();
  } catch (error) {
    if (error instanceof PlatformError) {
      io.err(error.message);
      return EXIT_FAILURE;
    }
    io.err(
      `Unexpected error (${describeError(error)}). Nothing was completed.`,
    );
    return EXIT_UNEXPECTED_ERROR;
  }
}

const provisionBarbershop: Command = (args, deps, io) =>
  guarded(io, async () => {
    const { values } = parseArgs({
      args,
      strict: true,
      options: {
        name: { type: "string" },
        unit: { type: "string" },
        timezone: { type: "string" },
        "owner-name": { type: "string" },
        "owner-email": { type: "string" },
      },
    });
    const command = ProvisionBarbershopCommand.safeParse({
      name: values.name,
      unit: values.unit,
      timezone: values.timezone,
      ownerName: values["owner-name"],
      ownerEmail: values["owner-email"],
    });
    if (!command.success) {
      for (const problem of command.error.issues) {
        io.err(`Invalid argument: ${problem.path.join(".")}`);
      }
      return EXIT_FAILURE;
    }
    const result = await deps.provisioning.provision(command.data);
    if (!result.invitationSent) {
      io.err(
        `Barbershop created (id: ${result.barbershopId}), but the invitation was not sent. ` +
          "Fix e-mail delivery and run 'resend-owner-invitation --email <owner e-mail>'.",
      );
      return EXIT_INVITATION_NOT_SENT;
    }
    io.out(`Barbershop provisioned: ${result.barbershopId}`);
    return 0;
  });

const resendOwnerInvitation: Command = (args, deps, io) =>
  guarded(io, async () => {
    const { values } = parseArgs({
      args,
      strict: true,
      options: { email: { type: "string" }, "new-email": { type: "string" } },
    });
    if (values.email === undefined) {
      io.err("Invalid argument: email");
      return EXIT_FAILURE;
    }
    const result = await deps.resend.resend({
      email: values.email,
      ...(values["new-email"] === undefined
        ? {}
        : { newEmail: values["new-email"] }),
    });
    if (!result.invitationSent) {
      io.err(
        "The invitation was renewed, but the e-mail could not be sent. Try again.",
      );
      return EXIT_INVITATION_NOT_SENT;
    }
    io.out("Invitation resent.");
    return 0;
  });

const anonymizeUser: Command = (args, deps, io) =>
  guarded(io, async () => {
    const { values } = parseArgs({
      args,
      strict: true,
      options: { email: { type: "string" } },
    });
    if (values.email === undefined) {
      io.err("Invalid argument: email");
      return EXIT_FAILURE;
    }
    const result = await deps.anonymization.anonymize({
      email: values.email,
    });
    // Identifies the user by id only: the e-mail is exactly the data being erased.
    io.out(
      result.alreadyAnonymized
        ? `User ${result.userId} was already anonymized.`
        : `User ${result.userId} anonymized.`,
    );
    return 0;
  });

const COMMANDS: Record<string, Command> = {
  "provision-barbershop": provisionBarbershop,
  "resend-owner-invitation": resendOwnerInvitation,
  "anonymize-user": anonymizeUser,
};

/** Dispatches the command and returns the exit code (non-zero on any failure). */
export async function runCli(
  argv: string[],
  deps: CliDeps,
  io: CliOutput,
): Promise<number> {
  const [name, ...rest] = argv;
  const command = name === undefined ? undefined : COMMANDS[name];
  if (command === undefined) {
    io.err(`Available commands: ${Object.keys(COMMANDS).join(", ")}`);
    return EXIT_FAILURE;
  }
  return guarded(io, () => command(rest, deps, io));
}
