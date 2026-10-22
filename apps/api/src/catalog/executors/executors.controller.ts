import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
} from "@nestjs/common";
import {
  ExecutorInput,
  type Executor,
  type ExecutorsOutput,
} from "@barbearia/contracts";
import { CurrentUser, Roles } from "../../identity/auth/decorators.js";
import type { AuthenticatedUser } from "../../identity/http/http-types.js";
import { requireUser } from "../../identity/http/require-user.js";
import { ResourceIdPipe } from "../../identity/http/resource-id.pipe.js";
import { ZodPipe } from "../../identity/http/zod.pipe.js";
import { ExecutorsService } from "./executors.service.js";

/** Who performs each service: any signed-in user reads, only the owner writes. */
@Controller("services/:id/executors")
export class ExecutorsController {
  constructor(private readonly executors: ExecutorsService) {}

  @Get()
  list(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
  ): Promise<ExecutorsOutput> {
    return this.executors.list(requireUser(current), id);
  }

  @Roles("owner")
  @Put(":userId")
  @HttpCode(200)
  link(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
    @Param("userId", new ResourceIdPipe()) userId: string,
    @Body(new ZodPipe(ExecutorInput)) input: ExecutorInput,
  ): Promise<Executor> {
    return this.executors.link(requireUser(current), id, userId, input);
  }

  @Roles("owner")
  @Delete(":userId")
  @HttpCode(204)
  unlink(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
    @Param("userId", new ResourceIdPipe()) userId: string,
  ): Promise<void> {
    return this.executors.unlink(requireUser(current), id, userId);
  }
}
