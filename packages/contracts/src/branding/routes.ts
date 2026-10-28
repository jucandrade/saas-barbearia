import { LOGO_TYPES, MAX_LOGO_BYTES } from "@barbearia/domain";
import type { RouteDefinition, RouteError } from "../identity/routes.js";
import { invalidData, notFound, tooMany } from "../identity/routes.js";
import { Branding, PublicIdentity, UpdateBrandingInput } from "./branding.js";

const forbidden: RouteError = { status: 403, code: "NO_PERMISSION" };
const unauthorized: RouteError = { status: 401, code: "INVALID_SESSION" };
const logoTooLarge: RouteError = { status: 413, code: "LOGO_TOO_LARGE" };
const logoUnsupported: RouteError = {
  status: 400,
  code: "LOGO_UNSUPPORTED_FORMAT",
};
const logoDimensions: RouteError = {
  status: 400,
  code: "LOGO_INVALID_DIMENSIONS",
};
const logoMismatch: RouteError = {
  status: 400,
  code: "LOGO_CONTENT_MISMATCH",
};

/** Every endpoint of the branding context (contracts/api.md of feature 004). */
export const BRANDING_ROUTES: readonly RouteDefinition[] = [
  {
    method: "get",
    path: "/branding",
    summary: "Read the visual identity of the barbershop",
    access: "session",
    status: 200,
    response: Branding,
    errors: [unauthorized],
  },
  {
    method: "put",
    path: "/branding",
    summary: "Save the theme, name and colors of the barbershop",
    access: "owner",
    status: 200,
    request: UpdateBrandingInput,
    response: Branding,
    errors: [forbidden, invalidData],
  },
  {
    method: "put",
    path: "/branding/logo",
    summary: "Send or replace the logo (raw PNG, JPEG or WebP bytes)",
    access: "owner",
    status: 200,
    body: {
      kind: "binary",
      contentTypes: LOGO_TYPES,
      maxBytes: MAX_LOGO_BYTES,
    },
    response: Branding,
    errors: [
      forbidden,
      logoTooLarge,
      logoUnsupported,
      logoDimensions,
      logoMismatch,
    ],
  },
  {
    method: "post",
    path: "/branding/reset",
    summary: "Restore the default theme and colors, keeping name and logo",
    access: "owner",
    status: 200,
    response: Branding,
    errors: [forbidden],
  },
  {
    method: "delete",
    path: "/branding/logo",
    summary: "Remove the logo (idempotent)",
    access: "owner",
    status: 200,
    response: Branding,
    errors: [forbidden],
  },
  {
    method: "get",
    path: "/public/barbershops/{slug}/identity",
    summary:
      "Theme, name, logo and colors behind a barbershop link, without a session",
    access: "public",
    status: 200,
    response: PublicIdentity,
    errors: [tooMany],
  },
  {
    method: "get",
    path: "/public/barbershops/{slug}/logo",
    summary: "The logo image behind a barbershop link, without a session",
    access: "public",
    status: 200,
    responseBinary: { contentTypes: LOGO_TYPES },
    errors: [notFound, tooMany],
  },
];
