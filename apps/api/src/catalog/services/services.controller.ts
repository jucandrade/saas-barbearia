import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  CreateServiceInput,
  ServiceListQuery,
  TermsQuery,
  UpdateServiceInput,
  type Service,
  type ServicesOutput,
  type TermsOutput,
} from "@barbearia/contracts";
import { CurrentUser, Roles } from "../../identity/auth/decorators.js";
import type { AuthenticatedUser } from "../../identity/http/http-types.js";
import { requireUser } from "../../identity/http/require-user.js";
import { ResourceIdPipe } from "../../identity/http/resource-id.pipe.js";
import { ZodPipe } from "../../identity/http/zod.pipe.js";
import { ExecutorsService } from "../executors/executors.service.js";
import { ServicesService } from "./services.service.js";

/** Services: any signed-in user reads, only the owner writes. */
@Controller("services")
export class ServicesController {
  constructor(
    private readonly services: ServicesService,
    private readonly executors: ExecutorsService,
  ) {}

  @Get()
  async list(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Query(new ZodPipe(ServiceListQuery)) query: ServiceListQuery,
  ): Promise<ServicesOutput> {
    return { services: await this.services.list(requireUser(current), query) };
  }

  @Roles("owner")
  @Post()
  create(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Body(new ZodPipe(CreateServiceInput)) input: CreateServiceInput,
  ): Promise<Service> {
    return this.services.create(requireUser(current), input);
  }

  @Get(":id")
  get(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
  ): Promise<Service> {
    return this.services.get(requireUser(current), id);
  }

  @Get(":id/terms")
  terms(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
    @Query(new ZodPipe(TermsQuery)) query: TermsQuery,
  ): Promise<TermsOutput> {
    return this.executors.terms(requireUser(current), id, query.userId);
  }

  @Roles("owner")
  @Patch(":id")
  update(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
    @Body(new ZodPipe(UpdateServiceInput)) input: UpdateServiceInput,
  ): Promise<Service> {
    return this.services.update(requireUser(current), id, input);
  }

  @Roles("owner")
  @Post(":id/deactivate")
  @HttpCode(204)
  deactivate(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
  ): Promise<void> {
    return this.services.deactivate(requireUser(current), id);
  }

  @Roles("owner")
  @Post(":id/reactivate")
  @HttpCode(204)
  reactivate(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
  ): Promise<void> {
    return this.services.reactivate(requireUser(current), id);
  }
}
