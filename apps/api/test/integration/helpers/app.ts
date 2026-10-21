import type { INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module.js";
import { ENV } from "../../../src/config/config.module.js";
import { lerEnv, type Env } from "../../../src/config/env.js";
import { TenantDb } from "../../../src/db/tenant-db.js";
import { SessaoService } from "../../../src/identidade/auth/sessao.service.js";
import { EmailPort } from "../../../src/identidade/email/email.port.js";
import { MemoriaAdapter } from "../../../src/identidade/email/memoria.adapter.js";
import {
  Relogio,
  RelogioControlavel,
} from "../../../src/identidade/relogio.js";
import type { Papel } from "@barbearia/domain";
import { urlRuntime } from "./db.js";

export const ORIGEM_ADMIN = "http://localhost:3001";

export interface AppDeTeste {
  app: INestApplication;
  relogio: RelogioControlavel;
  email: MemoriaAdapter;
  env: Env;
  /** Cliente HTTP em memória (supertest) apontado para o app. */
  http: () => ReturnType<typeof request>;
  /** Abre uma sessão direto no banco e devolve o token (para testes de rotas protegidas). */
  abrirSessao: (usuario: {
    id: string;
    tenantId: string;
    papel: Papel;
  }) => Promise<string>;
  fechar: () => Promise<void>;
}

export interface OpcoesApp {
  /** Módulos extras, por exemplo controladores de teste. */
  controladores?: Type[];
  relogio?: RelogioControlavel;
  email?: MemoriaAdapter;
  limitePorMinuto?: number;
}

/**
 * Sobe o app Nest completo sobre o banco de teste, com e-mail em memória, relógio
 * controlável e hash de senha barato, para os testes serem rápidos e determinísticos.
 */
export async function criarApp(opcoes: OpcoesApp = {}): Promise<AppDeTeste> {
  const relogio = opcoes.relogio ?? new RelogioControlavel();
  const email = opcoes.email ?? new MemoriaAdapter();
  const env = lerEnv({
    ...process.env,
    DATABASE_URL: urlRuntime(),
    ADMIN_BASE_URL: ORIGEM_ADMIN,
    ARGON2_MEMORY_KIB: "1024",
    ARGON2_TIME_COST: "1",
    ARGON2_PARALLELISM: "1",
    RATE_LIMIT_POR_MINUTO: String(opcoes.limitePorMinuto ?? 10_000),
  });

  const modulo = await Test.createTestingModule({
    imports: [AppModule],
    controllers: opcoes.controladores ?? [],
  })
    .overrideProvider(ENV)
    .useValue(env)
    .overrideProvider(Relogio)
    .useValue(relogio)
    .overrideProvider(EmailPort)
    .useValue(email)
    .compile();

  const app = modulo.createNestApplication();
  await app.init();

  return {
    app,
    relogio,
    email,
    env,
    http: () => request(app.getHttpServer() as Parameters<typeof request>[0]),
    abrirSessao: (usuario) =>
      app
        .get(TenantDb)
        .transacao(usuario.tenantId, (tx) =>
          app.get(SessaoService).iniciar(tx, usuario),
        ),
    fechar: () => app.close(),
  };
}
