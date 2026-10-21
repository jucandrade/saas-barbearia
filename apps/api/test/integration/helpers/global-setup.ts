import pg from "pg";
import { lerEnv } from "../../../src/config/env.js";
import { executarMigrations, garantirPapeis } from "../../../src/db/migrate.js";

const SENHA_OWNER = "owner_teste";

function urlPara(
  base: string,
  usuario: string,
  senha: string,
  banco: string,
): string {
  const url = new URL(base);
  url.username = usuario;
  url.password = senha;
  url.pathname = `/${banco}`;
  return url.toString();
}

/**
 * Cria um banco exclusivo da execução, dono `owner_teste` (sem superusuário e
 * sem BYPASSRLS), aplica as migrations reais como ele e remove tudo no fim. Assim
 * o FORCE ROW LEVEL SECURITY é testado também contra o dono das tabelas.
 */
export default async function setup(): Promise<() => Promise<void>> {
  try {
    return await preparar();
  } catch (erro) {
    // O Vitest às vezes esconde o erro original de um globalSetup; imprime antes de repassar.
    process.stderr.write(
      `Falha no global-setup: ${erro instanceof Error ? erro.message : String(erro)}\n`,
    );
    throw erro;
  }
}

async function preparar(): Promise<() => Promise<void>> {
  const env = lerEnv();
  const nomeBanco = `barbearia_teste_${String(Date.now())}_${String(process.pid)}`;

  const admin = new pg.Client({ connectionString: env.databaseAdminUrl });
  await admin.connect();
  try {
    await garantirPapeis(admin, env.appRuntimePassword);
    await admin.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'owner_teste') THEN
          CREATE ROLE owner_teste LOGIN;
        END IF;
      END
      $$
    `);
    await admin.query(
      `ALTER ROLE owner_teste NOSUPERUSER NOBYPASSRLS CREATEROLE LOGIN PASSWORD ${admin.escapeLiteral(SENHA_OWNER)}`,
    );
    // Quem migra precisa administrar os papéis da aplicação (PostgreSQL 16+).
    await admin.query("GRANT app_runtime TO owner_teste WITH ADMIN OPTION");
    await admin.query(
      "GRANT app_auth TO owner_teste WITH ADMIN OPTION, SET TRUE, INHERIT FALSE",
    );
    await admin.query(`CREATE DATABASE "${nomeBanco}" OWNER owner_teste`);
  } finally {
    await admin.end();
  }

  const urlOwner = urlPara(
    env.databaseAdminUrl,
    "owner_teste",
    SENHA_OWNER,
    nomeBanco,
  );
  await executarMigrations(urlOwner, env.appRuntimePassword);

  process.env["TEST_DB_NAME"] = nomeBanco;
  process.env["TEST_OWNER_URL"] = urlOwner;
  // Superusuário só para asserções globais dos testes (a RLS não o esconde de nada).
  process.env["TEST_SUPER_URL"] = urlPara(
    env.databaseAdminUrl,
    new URL(env.databaseAdminUrl).username,
    decodeURIComponent(new URL(env.databaseAdminUrl).password),
    nomeBanco,
  );
  process.env["TEST_RUNTIME_URL"] = urlPara(
    env.databaseAdminUrl,
    "app_runtime",
    env.appRuntimePassword,
    nomeBanco,
  );

  return async () => {
    const limpeza = new pg.Client({ connectionString: env.databaseAdminUrl });
    await limpeza.connect();
    try {
      await limpeza.query(
        `DROP DATABASE IF EXISTS "${nomeBanco}" WITH (FORCE)`,
      );
    } finally {
      await limpeza.end();
    }
  };
}
