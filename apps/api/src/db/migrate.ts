import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { readEnv } from "../config/env.js";

const FOLDER_MIGRATIONS = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

/**
 * Leaves the role without any special privilege. Only changes what differs, because
 * a non-superuser cannot even restate SUPERUSER or BYPASSRLS.
 */
async function adjustAttributes(
  client: pg.Client,
  role: string,
  login: boolean,
): Promise<void> {
  const { rows } = await client.query<{
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolcanlogin: boolean;
  }>(
    "SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin FROM pg_roles WHERE rolname = $1",
    [role],
  );
  const current = rows[0];
  if (current === undefined) {
    throw new Error(`Role ${role} not found`);
  }
  const changes: string[] = [];
  if (current.rolsuper) changes.push("NOSUPERUSER");
  if (current.rolbypassrls) changes.push("NOBYPASSRLS");
  if (current.rolcreaterole) changes.push("NOCREATEROLE");
  if (current.rolcreatedb) changes.push("NOCREATEDB");
  if (current.rolcanlogin !== login) changes.push(login ? "LOGIN" : "NOLOGIN");
  if (changes.length > 0) {
    await client.query(`ALTER ROLE ${role} ${changes.join(" ")}`);
  }
}

/**
 * Ensures the database roles, idempotently:
 * - `app_runtime`: used by the API; no superuser and no `BYPASSRLS` (R2);
 * - `app_auth`: no login; owner of the authentication functions (R3);
 * - `app_public`: no login; owner of the functions that read the public identity of a
 *   barbershop without a session (feature 004, R3).
 * Lets the migrator assume each of them (without inheriting their privileges),
 * so it can hand the functions over to them.
 */
export async function ensureRoles(
  client: pg.Client,
  runtimePassword: string,
): Promise<void> {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
        CREATE ROLE app_runtime LOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_auth') THEN
        CREATE ROLE app_auth NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_public') THEN
        CREATE ROLE app_public NOLOGIN;
      END IF;
    END
    $$
  `);
  await client.query(
    `ALTER ROLE app_runtime PASSWORD ${client.escapeLiteral(runtimePassword)}`,
  );
  await adjustAttributes(client, "app_runtime", true);
  await adjustAttributes(client, "app_auth", false);
  await adjustAttributes(client, "app_public", false);
  // INHERIT FALSE is essential: `TO app_auth` policies also apply to anyone who inherits the role,
  // and inheriting it would give the migrator tenant-less read access, defeating RLS.
  await client.query(
    "GRANT app_auth TO CURRENT_USER WITH SET TRUE, INHERIT FALSE",
  );
  await client.query(
    "GRANT app_public TO CURRENT_USER WITH SET TRUE, INHERIT FALSE",
  );
}

/** Ensures the roles and applies the pending migrations with the admin connection. */
export async function runMigrations(
  urlAdmin: string,
  runtimePassword: string,
): Promise<void> {
  const client = new pg.Client({ connectionString: urlAdmin });
  await client.connect();
  try {
    await ensureRoles(client, runtimePassword);
    await migrate(drizzle(client), { migrationsFolder: FOLDER_MIGRATIONS });
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = readEnv();
  runMigrations(env.databaseAdminUrl, env.appRuntimePassword)
    .then(() => {
      console.log("Migrations aplicadas.");
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
