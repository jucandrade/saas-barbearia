import { randomUUID } from "node:crypto";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "../../../src/db/schema/index.js";

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (valor === undefined || valor === "") {
    throw new Error(
      `${nome} não definido: o global-setup dos testes de integração não rodou`,
    );
  }
  return valor;
}

let poolOwner: pg.Pool | undefined;
let poolRuntime: pg.Pool | undefined;
let poolSuper: pg.Pool | undefined;

/** Conexão administrativa: `owner_teste`, dono das tabelas, sem superusuário. */
export function conexaoAdmin(): pg.Pool {
  poolOwner ??= new pg.Pool({
    connectionString: exigir("TEST_OWNER_URL"),
    max: 4,
  });
  return poolOwner;
}

/** Conexão da API: `app_runtime`, sem `BYPASSRLS` e que não é dona das tabelas. */
export function conexaoRuntime(): pg.Pool {
  poolRuntime ??= new pg.Pool({
    connectionString: exigir("TEST_RUNTIME_URL"),
    max: 4,
  });
  return poolRuntime;
}

/** Superusuário, só para contar linhas de todos os tenants nas asserções. */
export function conexaoSuper(): pg.Pool {
  poolSuper ??= new pg.Pool({
    connectionString: exigir("TEST_SUPER_URL"),
    max: 2,
  });
  return poolSuper;
}

/** Quantas barbearias existem com o nome, em todos os tenants. */
export async function contarBarbearias(nome: string): Promise<number> {
  const { rows } = await conexaoSuper().query<{ n: number }>(
    "select count(*)::int as n from barbearia where nome = $1",
    [nome],
  );
  return rows[0]?.n ?? 0;
}

/** Quantos usuários existem com o e-mail, em todos os tenants. */
export async function contarUsuariosPorEmail(email: string): Promise<number> {
  const { rows } = await conexaoSuper().query<{ n: number }>(
    "select count(*)::int as n from usuario where email = $1",
    [email],
  );
  return rows[0]?.n ?? 0;
}

export function urlRuntime(): string {
  return exigir("TEST_RUNTIME_URL");
}

export async function fecharConexoes(): Promise<void> {
  await Promise.all([poolOwner?.end(), poolRuntime?.end(), poolSuper?.end()]);
  poolOwner = undefined;
  poolRuntime = undefined;
  poolSuper = undefined;
}

export type BancoAdmin = NodePgDatabase<typeof schema>;

/**
 * Executa `fn` como administrador, mas com o contexto do tenant definido: a RLS
 * vale também para o dono das tabelas (FORCE), então até a fábrica precisa dele.
 */
export async function comTenantAdmin<T>(
  tenantId: string,
  fn: (
    tx: Parameters<Parameters<BancoAdmin["transaction"]>[0]>[0],
  ) => Promise<T>,
): Promise<T> {
  const banco = drizzle(conexaoAdmin(), { schema });
  return banco.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${tenantId}, true)`,
    );
    return fn(tx);
  });
}

export const novoUuid = (): string => randomUUID();
