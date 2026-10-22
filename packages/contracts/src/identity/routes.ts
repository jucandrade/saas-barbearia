import { z } from "zod";
import { LoginInput, MeOutput } from "./auth.js";
import {
  AcceptInvitationInput,
  InvitationInfo,
  SessionOutput,
} from "./invitation.js";
import { ForgotInput, ForgotOutput, ResetInput } from "./recovery.js";
import { InviteInput, InviteOutput, ResendOutput, TeamOutput } from "./team.js";
import { ErrorBody } from "./common.js";

export type HttpMethod = "get" | "post";
/** `public` needs no session; `session` any signed-in user; `owner` only owners. */
export type Access = "public" | "session" | "owner";

export interface RouteError {
  status: number;
  code: string;
}

export interface RouteDefinition {
  method: HttpMethod;
  /** OpenAPI-style path, with `{param}` placeholders. */
  path: string;
  summary: string;
  access: Access;
  /** Success status. */
  status: number;
  request?: z.ZodType;
  /** Success body; absent when the route answers without a body. */
  response?: z.ZodType;
  errors: readonly RouteError[];
}

const tooMany: RouteError = { status: 429, code: "TOO_MANY_REQUESTS" };
const invalidData: RouteError = { status: 400, code: "INVALID_DATA" };
const notFound: RouteError = { status: 404, code: "NOT_FOUND" };

/** Every endpoint of the identity context (contracts/api.md). */
export const ROUTES: readonly RouteDefinition[] = [
  {
    method: "post",
    path: "/auth/login",
    summary: "Sign in with e-mail and password",
    access: "public",
    status: 200,
    request: LoginInput,
    response: SessionOutput,
    errors: [
      { status: 401, code: "INVALID_CREDENTIALS" },
      invalidData,
      tooMany,
    ],
  },
  {
    method: "post",
    path: "/auth/logout",
    summary: "End the current session",
    access: "session",
    status: 204,
    errors: [{ status: 401, code: "INVALID_SESSION" }],
  },
  {
    method: "get",
    path: "/auth/me",
    summary: "Who is signed in and their barbershop",
    access: "session",
    status: 200,
    response: MeOutput,
    errors: [{ status: 401, code: "INVALID_SESSION" }],
  },
  {
    method: "get",
    path: "/auth/invitations/{token}",
    summary: "Show an invitation before asking for the password",
    access: "public",
    status: 200,
    response: InvitationInfo,
    errors: [{ status: 410, code: "INVALID_INVITATION" }, tooMany],
  },
  {
    method: "post",
    path: "/auth/invitations/accept",
    summary: "Accept an invitation, set the password and sign in",
    access: "public",
    status: 200,
    request: AcceptInvitationInput,
    response: SessionOutput,
    errors: [
      { status: 410, code: "INVALID_INVITATION" },
      { status: 400, code: "WEAK_PASSWORD" },
      invalidData,
      tooMany,
    ],
  },
  {
    method: "post",
    path: "/auth/password/forgot",
    summary: "Ask for a password recovery link",
    access: "public",
    status: 202,
    request: ForgotInput,
    response: ForgotOutput,
    errors: [invalidData, tooMany],
  },
  {
    method: "post",
    path: "/auth/password/reset",
    summary: "Set a new password with a recovery link",
    access: "public",
    status: 204,
    request: ResetInput,
    errors: [
      { status: 410, code: "INVALID_TOKEN" },
      { status: 400, code: "WEAK_PASSWORD" },
      invalidData,
      tooMany,
    ],
  },
  {
    method: "get",
    path: "/team",
    summary: "List the barbershop's team",
    access: "owner",
    status: 200,
    response: TeamOutput,
    errors: [{ status: 403, code: "NO_PERMISSION" }],
  },
  {
    method: "post",
    path: "/team/invitations",
    summary: "Invite a barber or another owner",
    access: "owner",
    status: 201,
    request: InviteInput,
    response: InviteOutput,
    errors: [{ status: 409, code: "EMAIL_UNAVAILABLE" }, invalidData],
  },
  {
    method: "post",
    path: "/team/{id}/resend-invitation",
    summary: "Resend the invitation of a user who has not signed in yet",
    access: "owner",
    status: 200,
    response: ResendOutput,
    errors: [notFound, { status: 409, code: "USER_NOT_INVITED" }],
  },
  {
    method: "post",
    path: "/team/{id}/deactivate",
    summary: "Deactivate a user and end their sessions",
    access: "owner",
    status: 204,
    errors: [notFound, { status: 409, code: "LAST_OWNER" }],
  },
  {
    method: "post",
    path: "/team/{id}/reactivate",
    summary: "Reactivate a deactivated user",
    access: "owner",
    status: 204,
    errors: [notFound, { status: 409, code: "USER_NOT_DEACTIVATED" }],
  },
];

type JsonSchema = Record<string, unknown>;

function jsonSchema(schema: z.ZodType): JsonSchema {
  // Transforms (trim, lowercase) cannot be represented: describe the input shape.
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
}

function bodyOf(schema: z.ZodType): JsonSchema {
  return { content: { "application/json": { schema: jsonSchema(schema) } } };
}

/** Builds the OpenAPI 3.1 document from the route registry (constitution principle V). */
export function buildOpenApi(
  routes: readonly RouteDefinition[] = ROUTES,
): JsonSchema {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const params = [...route.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    const responses: Record<string, unknown> = {
      [String(route.status)]: {
        description: "Success",
        ...(route.response === undefined ? {} : bodyOf(route.response)),
      },
    };
    const errors = [...route.errors];
    if (route.access === "owner")
      errors.push({ status: 401, code: "INVALID_SESSION" });
    for (const error of errors) {
      const key = String(error.status);
      const previous = (responses[key] as { description?: string } | undefined)
        ?.description;
      responses[key] = {
        description:
          previous === undefined ? error.code : `${previous}, ${error.code}`,
        ...bodyOf(ErrorBody),
      };
    }
    (paths[route.path] ??= {})[route.method] = {
      summary: route.summary,
      ...(route.access === "public"
        ? { security: [] }
        : { security: [{ sessionCookie: [] }, { bearer: [] }] }),
      ...(params.length > 0 ? { parameters: params } : {}),
      ...(route.request === undefined
        ? {}
        : { requestBody: { required: true, ...bodyOf(route.request) } }),
      responses,
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Barbearia API", version: "0.0.0" },
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: "apiKey", in: "cookie", name: "session" },
        bearer: { type: "http", scheme: "bearer" },
      },
    },
  };
}
