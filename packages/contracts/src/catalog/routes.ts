import type { RouteDefinition, RouteError } from "../identity/routes.js";
import { invalidData, notFound } from "../identity/routes.js";
import {
  CategoriesOutput,
  CreateCategoryInput,
  OrderInput,
  RenameCategoryInput,
} from "./categories.js";
import { ServiceCategory } from "./common.js";
import { Executor, ExecutorInput, ExecutorsOutput } from "./executors.js";
import { TermsOutput } from "./terms.js";
import {
  CreateServiceInput,
  Service,
  ServicesOutput,
  UpdateServiceInput,
} from "./services.js";

const forbidden: RouteError = { status: 403, code: "NO_PERMISSION" };
const unauthorized: RouteError = { status: 401, code: "INVALID_SESSION" };
const categoryNameTaken: RouteError = {
  status: 409,
  code: "CATEGORY_NAME_TAKEN",
};
const serviceNameTaken: RouteError = {
  status: 409,
  code: "SERVICE_NAME_TAKEN",
};

/** Every endpoint of the catalog context (contracts/api.md of feature 003). */
export const CATALOG_ROUTES: readonly RouteDefinition[] = [
  {
    method: "get",
    path: "/service-categories",
    summary: "List the service categories, in display order",
    access: "session",
    status: 200,
    response: CategoriesOutput,
    errors: [unauthorized],
  },
  {
    method: "post",
    path: "/service-categories",
    summary: "Create a service category",
    access: "owner",
    status: 201,
    request: CreateCategoryInput,
    response: ServiceCategory,
    errors: [forbidden, categoryNameTaken, invalidData],
  },
  {
    method: "patch",
    path: "/service-categories/{id}",
    summary: "Rename a service category",
    access: "owner",
    status: 200,
    request: RenameCategoryInput,
    response: ServiceCategory,
    errors: [forbidden, notFound, categoryNameTaken, invalidData],
  },
  {
    method: "put",
    path: "/service-categories/order",
    summary: "Set the display order of every category",
    access: "owner",
    status: 204,
    request: OrderInput,
    errors: [forbidden, { status: 400, code: "INVALID_ORDER" }, invalidData],
  },
  {
    method: "delete",
    path: "/service-categories/{id}",
    summary: "Remove an empty service category",
    access: "owner",
    status: 204,
    errors: [forbidden, notFound, { status: 409, code: "CATEGORY_NOT_EMPTY" }],
  },
  {
    method: "get",
    path: "/services",
    summary: "List the services of the barbershop",
    access: "session",
    status: 200,
    response: ServicesOutput,
    errors: [unauthorized],
  },
  {
    method: "post",
    path: "/services",
    summary: "Create a service",
    access: "owner",
    status: 201,
    request: CreateServiceInput,
    response: Service,
    errors: [forbidden, serviceNameTaken, invalidData],
  },
  {
    method: "get",
    path: "/services/{id}",
    summary: "Show a service",
    access: "session",
    status: 200,
    response: Service,
    errors: [unauthorized, notFound],
  },
  {
    method: "patch",
    path: "/services/{id}",
    summary: "Change the data of a service",
    access: "owner",
    status: 200,
    request: UpdateServiceInput,
    response: Service,
    errors: [forbidden, notFound, serviceNameTaken, invalidData],
  },
  {
    method: "post",
    path: "/services/{id}/deactivate",
    summary: "Take a service out of circulation (never deleted)",
    access: "owner",
    status: 204,
    errors: [forbidden, notFound],
  },
  {
    method: "post",
    path: "/services/{id}/reactivate",
    summary: "Put a deactivated service back in circulation",
    access: "owner",
    status: 204,
    errors: [forbidden, notFound],
  },
  {
    method: "get",
    path: "/services/{id}/executors",
    summary: "Who performs a service",
    access: "session",
    status: 200,
    response: ExecutorsOutput,
    errors: [unauthorized, notFound],
  },
  {
    method: "put",
    path: "/services/{id}/executors/{userId}",
    summary:
      "Link a user to a service, with optional specific price and duration",
    access: "owner",
    status: 200,
    request: ExecutorInput,
    response: Executor,
    errors: [
      forbidden,
      notFound,
      { status: 409, code: "EXECUTOR_NOT_ELIGIBLE" },
      invalidData,
    ],
  },
  {
    method: "delete",
    path: "/services/{id}/executors/{userId}",
    summary: "Unlink a user from a service",
    access: "owner",
    status: 204,
    errors: [forbidden, notFound],
  },
  {
    method: "get",
    path: "/services/{id}/terms",
    summary: "Price and duration that apply to an executor of a service",
    access: "session",
    status: 200,
    response: TermsOutput,
    errors: [unauthorized, notFound, invalidData],
  },
];
