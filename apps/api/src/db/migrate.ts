import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { lerEnv } from "../config/env.js";

const PASTA_MIGRATIONS = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

/**
 * Deixa o papel sem nenhum privilégio especial. Só altera o que difere, porque
 * quem não é superusuário não pode nem reafirmar SUPERUSER ou BYPASSRLS.
 */
async function ajustarAtributos(
  cliente: pg.Client,
  papel: string,
  login: boolean,
): Promise<void> {
  const { rows } = await cliente.query<{
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolcanlogin: boolean;
  }>(
    "SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin FROM pg_roles WHERE rolname = $1",
    [papel],
  );
  const atual = rows[0];
  if (atual === undefined) {
    throw new Error(`Papel ${papel} não encontrado`);
  }
  const mudancas: string[] = [];
  if (atual.rolsuper) mudancas.push("NOSUPERUSER");
  if (atual.rolbypassrls) mudancas.push("NOBYPASSRLS");
  if (atual.rolcreaterole) mudancas.push("NOCREATEROLE");
  if (atual.rolcreatedb) mudancas.push("NOCREATEDB");
  if (atual.rolcanlogin !== login) mudancas.push(login ? "LOGIN" : "NOLOGIN");
  if (mudancas.length > 0) {
    await cliente.query(`ALTER ROLE ${papel} ${mudancas.join(" ")}`);
  }
}

/**
 * Garante os papéis do banco de forma idempotente:
 * - `app_runtime`: usado pela API; sem superusuário e sem `BYPASSRLS` (R2);
 * - `app_auth`: sem login; dono das funções de autenticação (R3).
 * Concede a quem migra o direito de assumir `app_auth` (sem herdar seus privilégios),
 * para passar a ele a posse das funções.
 */
export async function garantirPapeis(
  cliente: pg.Client,
  senhaRuntime: string,
): Promise<void> {
  await cliente.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
        CREATE ROLE app_runtime LOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_auth') THEN
        CREATE ROLE app_auth NOLOGIN;
      END IF;
    END
    $$
  `);
  await cliente.query(
    `ALTER ROLE app_runtime PASSWORD ${cliente.escapeLiteral(senhaRuntime)}`,
  );
  await ajustarAtributos(cliente, "app_runtime", true);
  await ajustarAtributos(cliente, "app_auth", false);
  // INHERIT FALSE é essencial: as políticas `TO app_auth` valem também para quem herda o papel,
  // e herdá-lo daria ao migrador leitura sem contexto de tenant, furando a RLS.
  await cliente.query(
    "GRANT app_auth TO CURRENT_USER WITH SET TRUE, INHERIT FALSE",
  );
}

/** Garante os papéis e aplica as migrations pendentes com a conexão administrativa. */
export async function executarMigrations(
  urlAdmin: string,
  senhaRuntime: string,
): Promise<void> {
  const cliente = new pg.Client({ connectionString: urlAdmin });
  await cliente.connect();
  try {
    await garantirPapeis(cliente, senhaRuntime);
    await migrate(drizzle(cliente), { migrationsFolder: PASTA_MIGRATIONS });
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = lerEnv();
  executarMigrations(env.databaseAdminUrl, env.appRuntimePassword)
    .then(() => {
      console.log("Migrations aplicadas.");
    })
    .catch((erro: unknown) => {
      console.error(erro instanceof Error ? erro.message : erro);
      process.exitCode = 1;
    });
}
