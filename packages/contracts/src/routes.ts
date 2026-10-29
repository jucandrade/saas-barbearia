import { BRANDING_ROUTES } from "./branding/routes.js";
import { CATALOG_ROUTES } from "./catalog/routes.js";
import { IDENTITY_ROUTES, type RouteDefinition } from "./identity/routes.js";

export type {
  Access,
  HttpMethod,
  RouteDefinition,
  RouteError,
} from "./identity/routes.js";

/** Every endpoint of the API, one registry for the controllers check and the OpenAPI document. */
export const ROUTES: readonly RouteDefinition[] = [
  ...IDENTITY_ROUTES,
  ...CATALOG_ROUTES,
  ...BRANDING_ROUTES,
];
