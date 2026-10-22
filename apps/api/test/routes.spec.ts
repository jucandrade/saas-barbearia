import "reflect-metadata";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants.js";
import { RequestMethod } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ROUTES, type Access } from "@barbearia/contracts";
import { CategoriesController } from "../src/catalog/categories/categories.controller.js";
import { ServicesController } from "../src/catalog/services/services.controller.js";
import { AuthController } from "../src/identity/auth/auth.controller.js";
import { PUBLIC, ROLES } from "../src/identity/auth/decorators.js";
import { InvitationsController } from "../src/identity/invitations/invitations.controller.js";
import { RecoveryController } from "../src/identity/recovery/recovery.controller.js";
import { TeamController } from "../src/identity/team/team.controller.js";

type Controller = new (...args: never[]) => object;
const CONTROLLERS: Controller[] = [
  AuthController,
  InvitationsController,
  TeamController,
  RecoveryController,
  CategoriesController,
  ServicesController,
];

interface Found {
  key: string;
  access: Access;
}

/** Reads the real routes from the Nest decorators (no app boot, no database). */
function routesOf(controller: Controller): Found[] {
  const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
  const found: Found[] = [];
  for (const name of Object.getOwnPropertyNames(controller.prototype)) {
    const handler = (controller.prototype as Record<string, unknown>)[name];
    if (typeof handler !== "function") continue;
    const path = Reflect.getMetadata(PATH_METADATA, handler) as
      string | undefined;
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as
      RequestMethod | undefined;
    if (path === undefined || method === undefined) continue;

    const full =
      `/${[base, path].filter((part) => part !== "" && part !== "/").join("/")}`.replace(
        /:(\w+)/g,
        "{$1}",
      );
    const isPublic =
      Reflect.getMetadata(PUBLIC, handler) === true ||
      Reflect.getMetadata(PUBLIC, controller) === true;
    const roles = (Reflect.getMetadata(ROLES, handler) ??
      Reflect.getMetadata(ROLES, controller)) as string[] | undefined;
    const access: Access = isPublic
      ? "public"
      : roles?.includes("owner") === true
        ? "owner"
        : "session";
    found.push({
      key: `${RequestMethod[method].toLowerCase()} ${full}`,
      access,
    });
  }
  return found;
}

describe("route registry vs controllers", () => {
  const real = CONTROLLERS.flatMap(routesOf);

  it("every controller route is in the registry, and the other way around", () => {
    const fromRegistry = ROUTES.map((r) => `${r.method} ${r.path}`).sort();
    expect(real.map((r) => r.key).sort()).toEqual(fromRegistry);
  });

  it("the registry's access matches @Public() and @Roles()", () => {
    for (const route of ROUTES) {
      const match = real.find((r) => r.key === `${route.method} ${route.path}`);
      expect(match?.access, `${route.method} ${route.path}`).toBe(route.access);
    }
  });
});
