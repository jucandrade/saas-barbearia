import { z } from "zod";
import { LoginInput, MeOutput } from "./auth.js";
import {
  AcceptInvitationInput,
  InvitationInfo,
  SessionOutput,
} from "./invitation.js";
import { ForgotInput, ForgotOutput, ResetInput } from "./recovery.js";
import { InviteInput, InviteOutput, ResendOutput, TeamOutput } from "./team.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
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
  /** Raw binary request body (for example an image upload); instead of `request`. */
  body?: { kind: "binary"; contentTypes: readonly string[]; maxBytes: number };
  /** Raw binary success response (for example an image); instead of `response`. */
  responseBinary?: { contentTypes: readonly string[] };
  /** Success body; absent when the route answers without a body. */
  response?: z.ZodType;
  errors: readonly RouteError[];
}

export const tooMany: RouteError = { status: 429, code: "TOO_MANY_REQUESTS" };
export const invalidData: RouteError = { status: 400, code: "INVALID_DATA" };
export const notFound: RouteError = { status: 404, code: "NOT_FOUND" };

/** Every endpoint of the identity context (contracts/api.md). */
export const IDENTITY_ROUTES: readonly RouteDefinition[] = [
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
