import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminConnection,
  closeConnections,
  runtimeConnection,
  superConnection,
  withTenantAdmin,
} from "./helpers/db.js";
import {
  createBarbershop,
  createBranding,
  createBrandingEventInDatabase,
  createLogo,
  createUser,
  slugFor,
} from "./helpers/factory.js";
import { barbershop } from "../../src/db/schema/index.js";

interface Tenant {
  barbershopId: string;
  slug: string;
  ownerId: string;
  logoVersion: string;
}

const TABLES = [
  "barbershop_branding",
  "barbershop_logos",
  "branding_events",
] as const;

type Pool = ReturnType<typeof runtimeConnection>;

/** Runs the statement in a transaction with (or without) the tenant context, always rolled back. */
async function attempt(
  pool: Pool,
  tenantId: string | undefined,
  statement: string,
  params: unknown[] = [],
): Promise<
  { rows: Record<string, unknown>[]; affected: number } | { error: string }
> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (tenantId !== undefined) {
      await client.query("select set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);
    }
    const result = await client.query<Record<string, unknown>>(
      statement,
      params,
    );
    return { rows: result.rows, affected: result.rowCount ?? 0 };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

async function errorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const source = cause instanceof Error ? cause : error;
    return source instanceof Error ? source.message : String(source);
  }
  return "";
}

async function privilege(query: string, params: unknown[]): Promise<boolean> {
  const { rows } = await superConnection().query<{ ok: boolean }>(
    query,
    params,
  );
  return rows[0]?.ok === true;
}

describe("branding RLS: isolation and integrity in the database", () => {
  let a: Tenant;
  let b: Tenant;
  let plain: { barbershopId: string; slug: string };

  async function seed(name: string): Promise<Tenant> {
    const { barbershopId, slug } = await createBarbershop(name);
    const ownerId = await createUser({ tenantId: barbershopId, role: "owner" });
    const logoVersion = await createLogo({
      tenantId: barbershopId,
      content: Buffer.from(`logo of ${name}`),
    });
    await createBranding({ tenantId: barbershopId, logoVersion });
    await createBrandingEventInDatabase(barbershopId, ownerId);
    return { barbershopId, slug, ownerId, logoVersion };
  }

  beforeAll(async () => {
    a = await seed("Branding A");
    b = await seed("Branding B");
    plain = await createBarbershop("Branding Plain");
  });

  afterAll(closeConnections);

  describe("tenant isolation", () => {
    it.each(TABLES)(
      "%s has ENABLE and FORCE ROW LEVEL SECURITY",
      async (table) => {
        const { rows } = await superConnection().query<{
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }>(
          "select relrowsecurity, relforcerowsecurity from pg_class where relname = $1",
          [table],
        );
        expect(rows[0]).toEqual({
          relrowsecurity: true,
          relforcerowsecurity: true,
        });
      },
    );

    it.each(TABLES)(
      "%s: no tenant context reads and writes nothing",
      async (table) => {
        const read = await attempt(
          runtimeConnection(),
          undefined,
          `select * from ${table}`,
        );
        expect(read).toEqual({ rows: [], affected: 0 });
        const write = await attempt(
          runtimeConnection(),
          undefined,
          `insert into ${table} (tenant_id) values ('${a.barbershopId}')`,
        );
        expect("error" in write).toBe(true);
      },
    );

    it.each(TABLES)("%s: a tenant sees only its own rows", async (table) => {
      const result = await attempt(
        runtimeConnection(),
        a.barbershopId,
        `select tenant_id from ${table}`,
      );
      if ("error" in result) throw new Error(result.error);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(new Set(result.rows.map((r) => r["tenant_id"]))).toEqual(
        new Set([a.barbershopId]),
      );
    });

    it("another tenant's rows cannot be updated or deleted", async () => {
      const update = await attempt(
        runtimeConnection(),
        a.barbershopId,
        `update barbershop_branding set theme = 'leather' where tenant_id = '${b.barbershopId}'`,
      );
      expect(update).toMatchObject({ affected: 0 });

      const remove = await attempt(
        runtimeConnection(),
        a.barbershopId,
        `delete from barbershop_logos where tenant_id = '${b.barbershopId}'`,
      );
      expect(remove).toMatchObject({ affected: 0 });

      const rename = await attempt(
        runtimeConnection(),
        a.barbershopId,
        `update barbershops set name = 'Hijacked' where id = '${b.barbershopId}'`,
      );
      expect(rename).toMatchObject({ affected: 0 });
    });

    it("a tenant cannot write a row that belongs to another tenant", async () => {
      const result = await attempt(
        runtimeConnection(),
        a.barbershopId,
        `insert into barbershop_branding (tenant_id) values ('${b.barbershopId}')`,
      );
      expect("error" in result && result.error).toMatch(/row-level security/);
    });

    it("the owner of one tenant can rename only its own barbershop", async () => {
      const own = await attempt(
        runtimeConnection(),
        a.barbershopId,
        `update barbershops set name = 'Renamed A' where id = '${a.barbershopId}'`,
      );
      expect(own).toMatchObject({ affected: 1 });
    });

    it("the runtime role cannot touch other barbershop columns", async () => {
      const result = await attempt(
        runtimeConnection(),
        a.barbershopId,
        `update barbershops set public_slug = 'stolen-link' where id = '${a.barbershopId}'`,
      );
      expect("error" in result && result.error).toMatch(/permission denied/);
    });
  });

  describe("integrity constraints", () => {
    it("refuses logos outside 1 byte to 512 KB", async () => {
      const tenantId = plain.barbershopId;
      const empty = await errorOf(
        createLogo({ tenantId, content: Buffer.alloc(0) }),
      );
      expect(empty).toMatch(/barbershop_logos_size/);
      const big = await errorOf(
        createLogo({ tenantId, content: Buffer.alloc(524_289) }),
      );
      expect(big).toMatch(/barbershop_logos_size/);
    });

    it.each([
      [63, 500],
      [500, 63],
      [2001, 100],
      [100, 2001],
    ])("refuses a logo of %i x %i pixels", async (width, height) => {
      const message = await errorOf(
        createLogo({ tenantId: plain.barbershopId, width, height }),
      );
      expect(message).toMatch(/barbershop_logos_dimensions/);
    });

    it("refuses a theme or tone outside the closed lists", async () => {
      const theme = await attempt(
        adminConnection(),
        plain.barbershopId,
        "insert into barbershop_branding (tenant_id, theme) values ($1, 'sepia')",
        [plain.barbershopId],
      );
      expect("error" in theme && theme.error).toMatch(/enum branding_theme/);
      const tone = await attempt(
        adminConnection(),
        plain.barbershopId,
        "insert into barbershop_branding (tenant_id, primary_tone) values ($1, '#ff0000')",
        [plain.barbershopId],
      );
      expect("error" in tone && tone.error).toMatch(/enum branding_tone/);
    });

    it.each(["Upper", "-start", "end-", "a--b", "ab", "x".repeat(41), "a_b"])(
      "refuses the public slug %j",
      async (slug) => {
        const message = await errorOf(
          withTenantAdmin(plain.barbershopId, (tx) =>
            tx
              .update(barbershop)
              .set({ publicSlug: slug })
              .where(eq(barbershop.id, plain.barbershopId)),
          ),
        );
        expect(message).toMatch(/barbershops_public_slug_format/);
      },
    );

    it("refuses a public slug already taken", async () => {
      const message = await errorOf(
        createBarbershop("Twin", "America/Sao_Paulo", a.slug),
      );
      expect(message).toMatch(/barbershops_public_slug/);
    });

    it("every barbershop has a slug in a valid format, even if none was given", async () => {
      const { rows } = await superConnection().query<{ bad: number }>(
        `select count(*)::int as bad from barbershops
         where public_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(public_slug) not between 3 and 40`,
      );
      expect(rows[0]?.bad).toBe(0);
    });
  });

  describe("privileges of the runtime role", () => {
    it.each([
      ["barbershop_branding", "DELETE", false],
      ["barbershop_branding", "INSERT", true],
      ["barbershop_branding", "UPDATE", true],
      ["barbershop_logos", "DELETE", true],
      ["barbershop_logos", "UPDATE", true],
      ["branding_events", "SELECT", true],
      ["branding_events", "INSERT", true],
      ["branding_events", "UPDATE", false],
      ["branding_events", "DELETE", false],
    ])("app_runtime on %s: %s is %s", async (table, action, expected) => {
      expect(
        await privilege(
          "select has_table_privilege('app_runtime', $1, $2) as ok",
          [table, action],
        ),
      ).toBe(expected);
    });

    it("app_runtime updates only the name of a barbershop", async () => {
      expect(
        await privilege(
          "select has_column_privilege('app_runtime', 'barbershops', 'name', 'UPDATE') as ok",
          [],
        ),
      ).toBe(true);
      expect(
        await privilege(
          "select has_column_privilege('app_runtime', 'barbershops', 'public_slug', 'UPDATE') as ok",
          [],
        ),
      ).toBe(false);
    });
  });

  describe("immutable audit trail", () => {
    it.each([
      ["update", "update branding_events set type = 'branding_reset'"],
      ["delete", "delete from branding_events"],
      ["truncate", "truncate branding_events"],
    ])(
      "refuses to %s events, even for the table owner",
      async (_name, statement) => {
        const result = await attempt(
          adminConnection(),
          a.barbershopId,
          statement,
        );
        expect("error" in result && result.error).toMatch(/IMMUTABLE_EVENT/);
      },
    );
  });

  describe("anonymous read (no login, no tenant)", () => {
    it.each([...TABLES, "barbershops", "units", "users"])(
      "app_runtime reads nothing from %s without a tenant context",
      async (table) => {
        const result = await attempt(
          runtimeConnection(),
          undefined,
          `select * from ${table}`,
        );
        expect(result).toEqual({ rows: [], affected: 0 });
      },
    );

    it("public_get_identity returns only the documented columns", async () => {
      const client = await runtimeConnection().connect();
      try {
        const result = await client.query(
          "select * from public_get_identity($1)",
          [a.slug],
        );
        expect(result.fields.map((f) => f.name)).toEqual([
          "name",
          "theme",
          "primary_tone",
          "accent_tone",
          "logo_version",
          "updated_at",
        ]);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toMatchObject({
          theme: "day",
          primary_tone: "blue",
          accent_tone: "gold",
          logo_version: a.logoVersion,
        });
      } finally {
        client.release();
      }
    });

    it("public_get_identity returns the product default for a barbershop never customized", async () => {
      const result = await attempt(
        runtimeConnection(),
        undefined,
        "select * from public_get_identity($1)",
        [plain.slug],
      );
      if ("error" in result) throw new Error(result.error);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        name: "Branding Plain",
        theme: "noir",
        primary_tone: "gold",
        accent_tone: "gold",
        logo_version: null,
        updated_at: null,
      });
    });

    it("public_get_identity returns no row for an unknown slug", async () => {
      for (const slug of [
        slugFor("nobody"),
        "",
        "A_B",
        "'; drop table barbershops;--",
      ]) {
        const result = await attempt(
          runtimeConnection(),
          undefined,
          "select * from public_get_identity($1)",
          [slug],
        );
        expect(result).toEqual({ rows: [], affected: 0 });
      }
    });

    it("public_get_logo returns only the documented columns, and nothing without a logo", async () => {
      const client = await runtimeConnection().connect();
      try {
        const result = await client.query("select * from public_get_logo($1)", [
          a.slug,
        ]);
        expect(result.fields.map((f) => f.name)).toEqual([
          "content",
          "content_type",
          "version",
        ]);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toMatchObject({ version: a.logoVersion });
      } finally {
        client.release();
      }
      const none = await attempt(
        runtimeConnection(),
        undefined,
        "select * from public_get_logo($1)",
        [plain.slug],
      );
      expect(none).toEqual({ rows: [], affected: 0 });
    });

    it("each barbershop's slug reaches only its own identity", async () => {
      const result = await attempt(
        runtimeConnection(),
        undefined,
        "select name from public_get_identity($1)",
        [b.slug],
      );
      if ("error" in result) throw new Error(result.error);
      expect(result.rows).toEqual([{ name: "Branding B" }]);
    });
  });

  describe("the public role and the functions", () => {
    it("app_public cannot log in, bypass RLS or be a superuser", async () => {
      const { rows } = await superConnection().query<{
        rolcanlogin: boolean;
        rolbypassrls: boolean;
        rolsuper: boolean;
      }>(
        "select rolcanlogin, rolbypassrls, rolsuper from pg_roles where rolname = 'app_public'",
      );
      expect(rows[0]).toEqual({
        rolcanlogin: false,
        rolbypassrls: false,
        rolsuper: false,
      });
    });

    it("app_public only reads, and only the columns the functions need", async () => {
      for (const table of [...TABLES, "barbershops", "users", "units"]) {
        for (const action of ["INSERT", "UPDATE", "DELETE"]) {
          expect(
            await privilege(
              "select has_table_privilege('app_public', $1, $2) as ok",
              [table, action],
            ),
          ).toBe(false);
        }
      }
      expect(
        await privilege(
          "select has_column_privilege('app_public', 'barbershops', 'name', 'SELECT') as ok",
          [],
        ),
      ).toBe(true);
      expect(
        await privilege(
          "select has_column_privilege('app_public', 'barbershops', 'created_at', 'SELECT') as ok",
          [],
        ),
      ).toBe(false);
      expect(
        await privilege(
          "select has_table_privilege('app_public', 'users', 'SELECT') as ok",
          [],
        ),
      ).toBe(false);
    });

    it.each(["public_get_identity(text)", "public_get_logo(text)"])(
      "%s is executable by app_runtime and not by PUBLIC",
      async (signature) => {
        expect(
          await privilege(
            "select has_function_privilege('app_runtime', $1, 'EXECUTE') as ok",
            [signature],
          ),
        ).toBe(true);
        const { rows } = await superConnection().query<{ acl: string | null }>(
          "select proacl::text as acl from pg_proc where oid = $1::regprocedure",
          [signature],
        );
        expect(rows[0]?.acl ?? "").not.toMatch(/(^\{|,)=X\//);
      },
    );

    it.each(["public_get_identity(text)", "public_get_logo(text)"])(
      "%s is a SECURITY DEFINER owned by app_public",
      async (signature) => {
        const { rows } = await superConnection().query<{
          owner: string;
          secdef: boolean;
        }>(
          `select pg_get_userbyid(proowner) as owner, prosecdef as secdef
           from pg_proc where oid = $1::regprocedure`,
          [signature],
        );
        expect(rows[0]).toEqual({ owner: "app_public", secdef: true });
      },
    );
  });
});
