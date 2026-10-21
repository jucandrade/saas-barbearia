import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
  InviteInput,
  type InviteOutput,
  type TeamOutput,
  type ResendOutput,
} from "@barbearia/contracts";
import { Roles, CurrentUser } from "../auth/decorators.js";
import { ApiError } from "../http/api-error.js";
import { ResourceIdPipe } from "../http/resource-id.pipe.js";
import type { AuthenticatedUser } from "../http/http-types.js";
import { ZodPipe } from "../http/zod.pipe.js";
import { TeamService } from "./team.service.js";

function requireUser(
  current: AuthenticatedUser | undefined,
): AuthenticatedUser {
  if (current === undefined) {
    throw new ApiError(
      401,
      "INVALID_SESSION",
      "Sessão inválida ou expirada. Entre novamente.",
    );
  }
  return current;
}

/** Team management: owners only. Ids from another barbershop answer 404, like a nonexistent id. */
@Roles("owner")
@Controller("team")
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  async list(
    @CurrentUser() current: AuthenticatedUser | undefined,
  ): Promise<TeamOutput> {
    return { users: await this.team.list(requireUser(current)) };
  }

  @Post("invitations")
  invite(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Body(new ZodPipe(InviteInput)) input: InviteInput,
  ): Promise<InviteOutput> {
    return this.team.invite(requireUser(current), input);
  }

  @Post(":id/resend-invitation")
  @HttpCode(200)
  resendInvitation(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
  ): Promise<ResendOutput> {
    return this.team.resendInvitation(requireUser(current), id);
  }

  @Post(":id/deactivate")
  @HttpCode(204)
  deactivate(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
  ): Promise<void> {
    return this.team.deactivate(requireUser(current), id);
  }

  @Post(":id/reactivate")
  @HttpCode(204)
  reactivate(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
  ): Promise<void> {
    return this.team.reactivate(requireUser(current), id);
  }
}
