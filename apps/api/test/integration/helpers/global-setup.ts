import pg from "pg";
import { readEnv } from "../../../src/config/env.js";
import { runMigrations, ensureRoles } from "../../../src/db/migrate.js";

const OWNER_PASSWORD = "owner_test";

function urlTo(
  base: string,
  user: string,
  password: string,
  database: string,
): string {
  const url = new URL(base);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * Creates a database exclusive to the run, owned by `owner_test` (no superuser and
 * no BYPASSRLS), applies the real migrations as that role and drops everything at the end.
 * This way FORCE ROW LEVEL SECURITY is also tested against the table owner.
 */
export default async function setup(): Promise<() => Promise<void>> {
  try {
    return await prepare();
  } catch (error) {
    // Vitest sometimes hides the original error of a globalSetup; print it before rethrowing.
    process.stderr.write(
      `global-setup failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    throw error;
  }
}

async function prepare(): Promise<() => Promise<void>> {
  const env = readEnv();
  const databaseName = `barbershop_test_${String(Date.now())}_${String(process.pid)}`;

  const admin = new pg.Client({ connectionString: env.databaseAdminUrl });
  await admin.connect();
  try {
    await ensureRoles(admin, env.appRuntimePassword);
    await admin.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'owner_test') THEN
          CREATE ROLE owner_test LOGIN;
        END IF;
      END
      $$
    `);
    await admin.query(
      `ALTER ROLE owner_test NOSUPERUSER NOBYPASSRLS CREATEROLE LOGIN PASSWORD ${admin.escapeLiteral(OWNER_PASSWORD)}`,
    );
    // The migrator needs to administer the application roles (PostgreSQL 16+).
    await admin.query("GRANT app_runtime TO owner_test WITH ADMIN OPTION");
    await admin.query(
      "GRANT app_auth TO owner_test WITH ADMIN OPTION, SET TRUE, INHERIT FALSE",
    );
    await admin.query(
      "GRANT app_public TO owner_test WITH ADMIN OPTION, SET TRUE, INHERIT FALSE",
    );
    await admin.query(`CREATE DATABASE "${databaseName}" OWNER owner_test`);
  } finally {
    await admin.end();
  }

  const urlOwner = urlTo(
    env.databaseAdminUrl,
    "owner_test",
    OWNER_PASSWORD,
    databaseName,
  );
  await runMigrations(urlOwner, env.appRuntimePassword);

  process.env["TEST_DB_NAME"] = databaseName;
  process.env["TEST_OWNER_URL"] = urlOwner;
  // Superuser only for the tests' global assertions (RLS hides nothing from it).
  process.env["TEST_SUPER_URL"] = urlTo(
    env.databaseAdminUrl,
    new URL(env.databaseAdminUrl).username,
    decodeURIComponent(new URL(env.databaseAdminUrl).password),
    databaseName,
  );
  process.env["TEST_RUNTIME_URL"] = urlTo(
    env.databaseAdminUrl,
    "app_runtime",
    env.appRuntimePassword,
    databaseName,
  );

  return async () => {
    const clear = new pg.Client({ connectionString: env.databaseAdminUrl });
    await clear.connect();
    try {
      await clear.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
    } finally {
      await clear.end();
    }
  };
}
