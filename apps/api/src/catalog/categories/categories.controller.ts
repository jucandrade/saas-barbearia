import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import {
  CreateCategoryInput,
  OrderInput,
  RenameCategoryInput,
  type CategoriesOutput,
  type ServiceCategory,
} from "@barbearia/contracts";
import { CurrentUser, Roles } from "../../identity/auth/decorators.js";
import type { AuthenticatedUser } from "../../identity/http/http-types.js";
import { requireUser } from "../../identity/http/require-user.js";
import { ResourceIdPipe } from "../../identity/http/resource-id.pipe.js";
import { ZodPipe } from "../../identity/http/zod.pipe.js";
import { CategoriesService } from "./categories.service.js";

/** Service categories: any signed-in user reads, only the owner writes. */
@Controller("service-categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async list(
    @CurrentUser() current: AuthenticatedUser | undefined,
  ): Promise<CategoriesOutput> {
    return { categories: await this.categories.list(requireUser(current)) };
  }

  @Roles("owner")
  @Post()
  create(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Body(new ZodPipe(CreateCategoryInput)) input: CreateCategoryInput,
  ): Promise<ServiceCategory> {
    return this.categories.create(requireUser(current), input);
  }

  // Declared before ":id" routes so "order" is never read as an id.
  @Roles("owner")
  @Put("order")
  @HttpCode(204)
  reorder(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Body(new ZodPipe(OrderInput)) input: OrderInput,
  ): Promise<void> {
    return this.categories.reorder(requireUser(current), input);
  }

  @Roles("owner")
  @Patch(":id")
  rename(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
    @Body(new ZodPipe(RenameCategoryInput)) input: RenameCategoryInput,
  ): Promise<ServiceCategory> {
    return this.categories.rename(requireUser(current), id, input);
  }

  @Roles("owner")
  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() current: AuthenticatedUser | undefined,
    @Param("id", new ResourceIdPipe()) id: string,
  ): Promise<void> {
    return this.categories.remove(requireUser(current), id);
  }
}
