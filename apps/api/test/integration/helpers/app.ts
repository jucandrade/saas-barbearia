import type { INestApplication, LoggerService, Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module.js";
import { configureApp } from "../../../src/app-setup.js";
import { ENV } from "../../../src/config/config.module.js";
import { readEnv, type Env } from "../../../src/config/env.js";
import { TenantDb } from "../../../src/db/tenant-db.js";
import { SessionService } from "../../../src/identity/auth/session.service.js";
import { EmailPort } from "../../../src/identity/email/email.port.js";
import { MemoryAdapter } from "../../../src/identity/email/memory.adapter.js";
import { Clock, ControllableClock } from "../../../src/identity/clock.js";
import type { Role } from "@barbearia/domain";
import { urlRuntime } from "./db.js";

export const ADMIN_ORIGIN = "http://localhost:3001";

export interface TestApp {
  app: INestApplication;
  clock: ControllableClock;
  email: MemoryAdapter;
  env: Env;
  /** In-memory HTTP client (supertest) pointed at the app. */
  http: () => ReturnType<typeof request>;
  /** Opens a session straight in the database and returns the token (for protected-route tests). */
  openSession: (user: {
    id: string;
    tenantId: string;
    role: Role;
  }) => Promise<string>;
  close: () => Promise<void>;
}

export interface AppOptions {
  /** Extra modules, for example test controllers. */
  controllers?: Type[];
  clock?: ControllableClock;
  email?: MemoryAdapter;
  limitPerMinute?: number;
  /** Minimum response time of `forgot` (0 in tests, except the one that measures time). */
  recoveryFloorMs?: number;
  /** Replaces the Nest logger, for tests that inspect what gets logged. */
  logger?: LoggerService;
}

/** Logger that keeps every line in memory, so tests can check what was logged. */
export class CapturingLogger implements LoggerService {
  readonly lines: string[] = [];

  private add(level: string, message: unknown, params: unknown[]): void {
    this.lines.push(
      [level, message, ...params]
        .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
        .join(" "),
    );
  }

  log(message: unknown, ...params: unknown[]): void {
    this.add("log", message, params);
  }
  error(message: unknown, ...params: unknown[]): void {
    this.add("error", message, params);
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.add("warn", message, params);
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.add("debug", message, params);
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.add("verbose", message, params);
  }
}

/**
 * Boots the full Nest app on the test database, with in-memory e-mail, a controllable clock
 * and a cheap password hash, so tests are fast and deterministic.
 */
export async function createApp(options: AppOptions = {}): Promise<TestApp> {
  const clock = options.clock ?? new ControllableClock();
  const email = options.email ?? new MemoryAdapter();
  const env = readEnv({
    ...process.env,
    DATABASE_URL: urlRuntime(),
    ADMIN_BASE_URL: ADMIN_ORIGIN,
    ARGON2_MEMORY_KIB: "1024",
    ARGON2_TIME_COST: "1",
    ARGON2_PARALLELISM: "1",
    RATE_LIMIT_PER_MINUTE: String(options.limitPerMinute ?? 10_000),
    RECOVERY_FLOOR_MS: String(options.recoveryFloorMs ?? 0),
  });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(ENV)
    .useValue(env)
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(EmailPort)
    .useValue(email)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env);
  if (options.logger !== undefined) {
    app.useLogger(options.logger);
  }
  await app.init();

  return {
    app,
    clock,
    email,
    env,
    http: () => request(app.getHttpServer()),
    openSession: (user) =>
      app
        .get(TenantDb)
        .transaction(user.tenantId, (tx) =>
          app.get(SessionService).start(tx, user),
        ),
    close: () => app.close(),
  };
}
