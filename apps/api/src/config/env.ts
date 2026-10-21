import { z } from "zod";

const integerPositive = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const schema = z.object({
  PORT: integerPositive(3000),
  POSTGRES_USER: z.string().min(1).default("barbearia"),
  POSTGRES_PASSWORD: z.string().min(1).default("barbearia"),
  POSTGRES_DB: z.string().min(1).default("barbearia"),
  POSTGRES_PORT: integerPositive(5432),
  APP_RUNTIME_PASSWORD: z.string().min(1).default("app_runtime"),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_ADMIN_URL: z.string().min(1).optional(),
  MAILPIT_SMTP_PORT: integerPositive(1025),
  SMTP_URL: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).default("Barbearia <nao-responder@localhost>"),
  ADMIN_BASE_URL: z.url().default("http://localhost:3001"),
  SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ARGON2_MEMORY_KIB: integerPositive(19_456),
  ARGON2_TIME_COST: integerPositive(2),
  ARGON2_PARALLELISM: integerPositive(1),
  RATE_LIMIT_PER_MINUTE: integerPositive(20),
  RECOVERY_FLOOR_MS: z.coerce.number().int().min(0).default(250),
});

export interface Env {
  port: number;
  databaseUrl: string;
  databaseAdminUrl: string;
  appRuntimePassword: string;
  smtpUrl: string;
  smtpFrom: string;
  adminBaseUrl: string;
  secureCookie: boolean;
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
  limitPerMinute: number;
  /** Minimum response time of `forgot`, so an existing account is indistinguishable from a missing one. */
  recoveryFloorMs: number;
}

/**
 * Reads and validates the environment variables. Everything has a default for local
 * development; the database URLs derive from the Compose `POSTGRES_*` variables.
 */
export function readEnv(origin: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(origin);
  if (!result.success) {
    const problems = result.error.issues
      .map((problem) => `${problem.path.join(".")}: ${problem.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const e = result.data;
  const host = `localhost:${String(e.POSTGRES_PORT)}/${e.POSTGRES_DB}`;
  const encode = encodeURIComponent;
  return {
    port: e.PORT,
    databaseUrl:
      e.DATABASE_URL ??
      `postgres://app_runtime:${encode(e.APP_RUNTIME_PASSWORD)}@${host}`,
    databaseAdminUrl:
      e.DATABASE_ADMIN_URL ??
      `postgres://${encode(e.POSTGRES_USER)}:${encode(e.POSTGRES_PASSWORD)}@${host}`,
    appRuntimePassword: e.APP_RUNTIME_PASSWORD,
    smtpUrl: e.SMTP_URL ?? `smtp://localhost:${String(e.MAILPIT_SMTP_PORT)}`,
    smtpFrom: e.SMTP_FROM,
    adminBaseUrl: e.ADMIN_BASE_URL.replace(/\/$/, ""),
    secureCookie: e.SESSION_COOKIE_SECURE,
    argon2: {
      memoryCost: e.ARGON2_MEMORY_KIB,
      timeCost: e.ARGON2_TIME_COST,
      parallelism: e.ARGON2_PARALLELISM,
    },
    limitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    recoveryFloorMs: e.RECOVERY_FLOOR_MS,
  };
}
