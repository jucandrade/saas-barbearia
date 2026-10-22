import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  AcceptInvitationInput,
  type InvitationInfo,
  type SessionOutput,
} from "@barbearia/contracts";
import { ENV, type Env } from "../../config/config.module.js";
import { Public } from "../auth/decorators.js";
import { respondWithSession } from "../auth/session-http.js";
import { ZodPipe } from "../http/zod.pipe.js";
import type { HttpResponse } from "../http/http-types.js";
import { InvitationsService } from "./invitations.service.js";

@Public()
@UseGuards(ThrottlerGuard)
@Controller("auth/invitations")
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get(":token")
  query(@Param("token") token: string): Promise<InvitationInfo> {
    return this.invitations.query(token);
  }

  @Post("accept")
  @HttpCode(200)
  async accept(
    @Body(new ZodPipe(AcceptInvitationInput)) input: AcceptInvitationInput,
    @Res({ passthrough: true }) res: HttpResponse,
  ): Promise<SessionOutput> {
    const { user, token } = await this.invitations.accept(input);
    return respondWithSession(res, this.env, input.client, token, user);
  }
}
