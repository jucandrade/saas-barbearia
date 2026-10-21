import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { user } from "../../src/db/schema/index.js";
import {
  withTenantAdmin,
  adminConnection,
  runtimeConnection,
  superConnection,
  closeConnections,
} from "./helpers/db.js";
import {
  createBarbershop,
  createEventInDatabase,
  createSessionInDatabase,
  createAccessToken,
  createUser,
} from "./helpers/factory.js";

interface Tenant {
  barbershopId: string;
  userId: string;
}

/** Tables isolated per tenant and the column that ties them to the owner (`barbershops` itself uses `id`). */
const TABLES = [
  { name: "barbershops", column: "id" },
  { name: "units", column: "tenant_id" },
  { name: "users", column: "tenant_id" },
  { name: "access_tokens", column: "tenant_id" },
  { name: "sessions", column: "tenant_id" },
  { name: "security_events", column: "tenant_id" },
] as const;

/** Runs inside a transaction with (or without) the tenant context, always rolled back at the end. */
async function runAs<T>(
  pool: typeof runtimeConnection extends () => infer P ? P : never,
  tenantId: string | undefined,
  fn: (
    query: (
      sql: string,
    ) => Promise<{ rowCount: number | null; rows: Record<string, unknown>[] }>,
  ) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (tenantId !== undefined) {
      await client.query("select set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);
    }
    return await fn((sql) => client.query(sql));
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

/** Result of a write: how many rows it affected or the error the database returned. */
async function attempt(
  pool: Parameters<typeof runAs>[0],
  tenantId: string | undefined,
  sql: string,
): Promise<{ affected: number } | { error: string }> {
  try {
    return await runAs(pool, tenantId, async (query) => ({
      affected: (await query(sql)).rowCount ?? 0,
    }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

describe("RLS: per-tenant isolation in the database", () => {
  let a: Tenant;
  let b: Tenant;

  async function seed(name: string): Promise<Tenant> {
    const { barbershopId } = await createBarbershop(name);
    const userId = await createUser({
      tenantId: barbershopId,
      role: "owner",
    });
    await createAccessToken({
      tenantId: barbershopId,
      userId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await createSessionInDatabase({ tenantId: barbershopId, userId });
    await createEventInDatabase(barbershopId);
    return { barbershopId, userId };
  }

  beforeAll(async () => {
    a = await seed("RLS A");
    b = await seed("RLS B");
  });

  afterAll(closeConnections);

  describe.each(TABLES)("table $name", ({ name, column }) => {
    it("the API, without a tenant context, reads no row", async () => {
      const r = await runAs(runtimeConnection(), undefined, (q) =>
        q(`select * from ${name}`),
      );
      expect(r.rows).toHaveLength(0);
    });

    it("the API, with A's context, reads only A's rows and none of B's", async () => {
      const r = await runAs(runtimeConnection(), a.barbershopId, (q) =>
        q(`select ${column} as owner from ${name}`),
      );
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.rows.every((l) => l["owner"] === a.barbershopId)).toBe(true);
    });

    it("the API, with A's context, sees no row of B even with an explicit filter", async () => {
      const r = await runAs(runtimeConnection(), a.barbershopId, (q) =>
        q(`select * from ${name} where ${column} = '${b.barbershopId}'`),
      );
      expect(r.rows).toHaveLength(0);
    });

    it("the API does not change B's rows (zero affected or no permission)", async () => {
      const set: Record<string, string> = {
        security_events: "type = 'logout'",
        sessions: "revoked_at = now()",
        access_tokens: "used_at = now()",
        users: "name = 'x'",
        units: "name = 'x'",
        barbershops: "name = 'x'",
      };
      const r = await attempt(
        runtimeConnection(),
        a.barbershopId,
        `update ${name} set ${set[name] ?? ""} where ${column} = '${b.barbershopId}'`,
      );
      if ("error" in r) {
        expect(r.error).toMatch(
          /permission denied|row-level security|EVENTO_IMUTAVEL/i,
        );
      } else {
        expect(r.affected).toBe(0);
      }
    });

    it("the API never deletes rows (no DELETE on any table)", async () => {
      const r = await attempt(
        runtimeConnection(),
        a.barbershopId,
        `delete from ${name}`,
      );
      expect(r).toHaveProperty("error");
      expect("error" in r && r.error).toMatch(/permission denied/i);
    });

    it("the table owner (not a superuser), without context, also reads nothing (FORCE)", async () => {
      const r = await runAs(adminConnection(), undefined, (q) =>
        q(`select * from ${name}`),
      );
      expect(r.rows).toHaveLength(0);
    });

    it("the table owner, with A's context, reads only A", async () => {
      const r = await runAs(adminConnection(), a.barbershopId, (q) =>
        q(`select ${column} as owner from ${name}`),
      );
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.rows.every((l) => l["owner"] === a.barbershopId)).toBe(true);
    });
  });

  describe("cross writes", () => {
    const inserts: Record<string, (tenant: string, userId: string) => string> =
      {
        user: (t) =>
          `insert into users (tenant_id, name, email, role, status) values ('${t}', 'Intruder', 'intruder-rls@example.com', 'barber', 'invited')`,
        access_tokens: (t, u) =>
          `insert into access_tokens (tenant_id, user_id, purpose, token_hash, expires_at) values ('${t}', '${u}', 'invitation', decode('aa', 'hex'), now())`,
        session: (t, u) =>
          `insert into sessions (tenant_id, user_id, token_hash, expires_at) values ('${t}', '${u}', decode('bb', 'hex'), now())`,
        security_events: (t) =>
          `insert into security_events (tenant_id, type, actor_type) values ('${t}', 'logout', 'system')`,
      };

    it.each(Object.keys(inserts))(
      "A's context cannot insert into %s with B's tenant",
      async (table) => {
        const r = await attempt(
          runtimeConnection(),
          a.barbershopId,
          inserts[table]?.(b.barbershopId, b.userId) ?? "",
        );
        expect(r).toHaveProperty("error");
        expect("error" in r && r.error).toMatch(
          /row-level security|violates foreign key/i,
        );
      },
    );

    it("without a context nothing is inserted", async () => {
      for (const table of Object.keys(inserts)) {
        const r = await attempt(
          runtimeConnection(),
          undefined,
          inserts[table]?.(a.barbershopId, a.userId) ?? "",
        );
        expect(r).toHaveProperty("error");
      }
    });
  });

  describe("database roles", () => {
    it("the API is not a superuser, has no BYPASSRLS and owns no table", async () => {
      const role = await runtimeConnection().query(
        "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
      );
      expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
      const owned = await runtimeConnection().query(
        "select count(*)::int as n from pg_tables where schemaname = 'public' and tableowner = current_user",
      );
      expect(owned.rows[0]).toEqual({ n: 0 });
    });

    it("every table has RLS enabled and FORCE", async () => {
      const r = await superConnection().query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        "select relname, relrowsecurity, relforcerowsecurity from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace and relname = any($1)",
        [TABLES.map((t) => t.name)],
      );
      expect(r.rows).toHaveLength(TABLES.length);
      expect(
        r.rows.every((l) => l.relrowsecurity && l.relforcerowsecurity),
      ).toBe(true);
    });

    it("app_auth has neither login nor BYPASSRLS", async () => {
      const r = await superConnection().query(
        "select rolcanlogin, rolbypassrls, rolsuper from pg_roles where rolname = 'app_auth'",
      );
      expect(r.rows[0]).toEqual({
        rolcanlogin: false,
        rolbypassrls: false,
        rolsuper: false,
      });
    });

    it("regression: the migrator can assume app_auth but does NOT inherit the unrestricted read", async () => {
      // `TO app_auth` policies apply to anyone who inherits the role; inheriting it would break RLS.
      const r = await superConnection().query<{ inherits: boolean }>(
        "select pg_has_role('owner_test', 'app_auth', 'USAGE') as inherits",
      );
      expect(r.rows[0]?.inherits).toBe(false);
      const can = await superConnection().query<{ can: boolean }>(
        "select pg_has_role('owner_test', 'app_auth', 'SET') as can",
      );
      expect(can.rows[0]?.can).toBe(true);
    });

    it("the API does not inherit app_auth", async () => {
      const r = await superConnection().query<{ inherits: boolean }>(
        "select pg_has_role('app_runtime', 'app_auth', 'USAGE') as inherits",
      );
      expect(r.rows[0]?.inherits).toBe(false);
    });
  });

  describe("authentication functions", () => {
    const FUNCTIONS = [
      "auth_find_user_by_email",
      "auth_find_session",
      "auth_find_access_token",
    ];

    it("belong to app_auth, are SECURITY DEFINER and pin the search_path", async () => {
      const r = await superConnection().query<{
        proname: string;
        owner: string;
        prosecdef: boolean;
        config: string[];
      }>(
        "select proname, pg_get_userbyid(proowner) as owner, prosecdef, proconfig as config from pg_proc where proname = any($1) order by proname",
        [FUNCTIONS],
      );
      expect(r.rows).toHaveLength(3);
      for (const f of r.rows) {
        expect(f.owner).toBe("app_auth");
        expect(f.prosecdef).toBe(true);
        expect(f.config.join(",")).toContain("search_path=pg_catalog, public");
      }
    });

    it("nobody (PUBLIC) can execute them; only the API and the migrator", async () => {
      const r = await superConnection().query<{
        proname: string;
        grantee: string;
      }>(
        `select p.proname, coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC') as grantee
         from pg_proc p, aclexplode(p.proacl) a
         where p.proname = any($1) and a.privilege_type = 'EXECUTE'`,
        [FUNCTIONS],
      );
      const grantees = new Set(r.rows.map((l) => l.grantee));
      expect(grantees.has("PUBLIC")).toBe(false);
      expect(grantees.has("app_runtime")).toBe(true);
      expect(grantees.has("owner_test")).toBe(true);
      expect(
        [...grantees].every((g) =>
          ["app_runtime", "owner_test", "app_auth"].includes(g),
        ),
      ).toBe(true);
    });

    it("the functions see every tenant, but return only the authentication columns", async () => {
      const { rows } = await runtimeConnection().query(
        "select * from auth_find_user_by_email('nonexistent@example.com')",
      );
      expect(rows).toHaveLength(0);
      const columns = await runtimeConnection().query(
        "select * from auth_find_user_by_email((select email from users where false)) limit 0",
      );
      expect(columns.fields.map((f) => f.name)).toEqual([
        "id",
        "tenant_id",
        "role",
        "status",
        "password_hash",
        "failed_attempts",
        "locked_until",
      ]);
    });
  });

  describe("immutable audit trail", () => {
    it("not even the table owner updates, deletes or truncates events", async () => {
      const count = async () =>
        (
          await superConnection().query<{ n: number }>(
            "select count(*)::int as n from security_events",
          )
        ).rows[0]?.n;
      const before = await count();
      // UPDATE and DELETE do not even see the rows (RLS has no policy for them) or hit the trigger.
      for (const sql of [
        "update security_events set type = 'logout'",
        "delete from security_events",
      ]) {
        const r = await attempt(adminConnection(), a.barbershopId, sql);
        if ("error" in r) {
          expect(r.error).toMatch(/IMMUTABLE_EVENT/);
        } else {
          expect(r.affected).toBe(0);
        }
      }
      // TRUNCATE ignora a RLS e cai direto no gatilho.
      const truncate = await attempt(
        adminConnection(),
        a.barbershopId,
        "truncate security_events",
      );
      expect("error" in truncate && truncate.error).toMatch(/IMMUTABLE_EVENT/);
      expect(await count()).toBe(before);
    });

    it("the API cannot update or delete events (no permission)", async () => {
      for (const sql of [
        "update security_events set type = 'logout'",
        "delete from security_events",
      ]) {
        const r = await attempt(runtimeConnection(), a.barbershopId, sql);
        expect("error" in r && r.error).toMatch(/permission denied/i);
      }
    });

    it("events without a barbershop (null tenant_id) exist but no barbershop sees them", async () => {
      await createEventInDatabase(null);
      const global = await superConnection().query<{ n: number }>(
        "select count(*)::int as n from security_events where tenant_id is null",
      );
      expect(global.rows[0]?.n).toBeGreaterThan(0);
      for (const tenantId of [a.barbershopId, b.barbershopId]) {
        const r = await runAs(runtimeConnection(), tenantId, (q) =>
          q("select * from security_events where tenant_id is null"),
        );
        expect(r.rows).toHaveLength(0);
      }
      const withoutContext = await runAs(runtimeConnection(), undefined, (q) =>
        q("select * from security_events"),
      );
      expect(withoutContext.rows).toHaveLength(0);
    });
  });

  it("the seeded data of A and B stays intact after all the attempts", async () => {
    for (const t of [a, b]) {
      const users = await withTenantAdmin(t.barbershopId, (tx) =>
        tx.select().from(user),
      );
      expect(users).toHaveLength(1);
      expect(users[0]?.name).toBe("Test User");
    }
  });
});
