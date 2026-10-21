import { z } from "zod";

const inteiroPositivo = (padrao: number) =>
  z.coerce.number().int().positive().default(padrao);

const esquema = z.object({
  PORT: inteiroPositivo(3000),
  POSTGRES_USER: z.string().min(1).default("barbearia"),
  POSTGRES_PASSWORD: z.string().min(1).default("barbearia"),
  POSTGRES_DB: z.string().min(1).default("barbearia"),
  POSTGRES_PORT: inteiroPositivo(5432),
  APP_RUNTIME_PASSWORD: z.string().min(1).default("app_runtime"),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_ADMIN_URL: z.string().min(1).optional(),
  MAILPIT_SMTP_PORT: inteiroPositivo(1025),
  SMTP_URL: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).default("Barbearia <nao-responder@localhost>"),
  ADMIN_BASE_URL: z.url().default("http://localhost:3001"),
  SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
  ARGON2_MEMORY_KIB: inteiroPositivo(19_456),
  ARGON2_TIME_COST: inteiroPositivo(2),
  ARGON2_PARALLELISM: inteiroPositivo(1),
  RATE_LIMIT_POR_MINUTO: inteiroPositivo(20),
});

export interface Env {
  porta: number;
  databaseUrl: string;
  databaseAdminUrl: string;
  appRuntimePassword: string;
  smtpUrl: string;
  smtpFrom: string;
  adminBaseUrl: string;
  cookieSeguro: boolean;
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
  limitePorMinuto: number;
}

/**
 * Lê e valida as variáveis de ambiente. Tudo tem padrão para desenvolvimento
 * local; as URLs do banco derivam das variáveis `POSTGRES_*` do Compose.
 */
export function lerEnv(origem: NodeJS.ProcessEnv = process.env): Env {
  const resultado = esquema.safeParse(origem);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((problema) => `${problema.path.join(".")}: ${problema.message}`)
      .join("; ");
    throw new Error(`Configuração de ambiente inválida: ${problemas}`);
  }
  const e = resultado.data;
  const host = `localhost:${String(e.POSTGRES_PORT)}/${e.POSTGRES_DB}`;
  const codificar = encodeURIComponent;
  return {
    porta: e.PORT,
    databaseUrl:
      e.DATABASE_URL ??
      `postgres://app_runtime:${codificar(e.APP_RUNTIME_PASSWORD)}@${host}`,
    databaseAdminUrl:
      e.DATABASE_ADMIN_URL ??
      `postgres://${codificar(e.POSTGRES_USER)}:${codificar(e.POSTGRES_PASSWORD)}@${host}`,
    appRuntimePassword: e.APP_RUNTIME_PASSWORD,
    smtpUrl: e.SMTP_URL ?? `smtp://localhost:${String(e.MAILPIT_SMTP_PORT)}`,
    smtpFrom: e.SMTP_FROM,
    adminBaseUrl: e.ADMIN_BASE_URL.replace(/\/$/, ""),
    cookieSeguro: e.SESSION_COOKIE_SECURE,
    argon2: {
      memoryCost: e.ARGON2_MEMORY_KIB,
      timeCost: e.ARGON2_TIME_COST,
      parallelism: e.ARGON2_PARALLELISM,
    },
    limitePorMinuto: e.RATE_LIMIT_POR_MINUTO,
  };
}
