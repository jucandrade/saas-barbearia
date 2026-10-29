import type { NestExpressApplication } from "@nestjs/platform-express";
import { LOGO_TYPES } from "@barbearia/domain";
import type { Env } from "./config/env.js";

/**
 * Body limit of the raw image parser. It is a ceiling against memory abuse, above the 512 KB
 * that the logo rules accept, so a slightly too large logo is answered by the application with
 * `LOGO_TOO_LARGE` and an explanation instead of a bare parser error.
 */
export const RAW_IMAGE_BODY_LIMIT = "1mb";

/**
 * Configuration shared by the real server and the integration tests, so the tests exercise the
 * same HTTP behavior as production: CORS for the admin (cookie sessions) and the raw parser
 * that the logo upload needs (R6).
 */
export function configureApp(app: NestExpressApplication, env: Env): void {
  // The admin (another port) calls the API with the session cookie: it needs CORS with credentials.
  app.enableCors({ origin: env.adminBaseUrl, credentials: true });
  // Only image content types are read as raw bytes; every other route keeps the JSON parser.
  app.useBodyParser("raw", {
    type: [...LOGO_TYPES],
    limit: RAW_IMAGE_BODY_LIMIT,
  });
}
