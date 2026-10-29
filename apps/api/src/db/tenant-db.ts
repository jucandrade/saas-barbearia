import { Inject, Injectable } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import type {
  LogoType,
  Role,
  ThemeId,
  ToneId,
  UserStatus,
} from "@barbearia/domain";
import * as schema from "./schema/index.js";

export const POOL = Symbol("POOL");

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UserForLogin {
  id: string;
  tenantId: string;
  role: Role;
  status: UserStatus;
  passwordHash: string | null;
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface FoundSession {
  sessionId: string;
  tenantId: string;
  userId: string;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  role: Role;
  status: UserStatus;
}

export interface FoundAccessToken {
  id: string;
  tenantId: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  invalidatedAt: Date | null;
}

/**
 * The three lookups that must run before the tenant is known (login,
 * session, invitation and recovery). They call the database `auth_*` functions and
 * offer no other access outside RLS (R3).
 */
export class AuthLookups {
  constructor(private readonly pool: Pool) {}

  async findUserByEmail(email: string): Promise<UserForLogin | undefined> {
    const { rows } = await this.pool.query<{
      id: string;
      tenant_id: string;
      role: Role;
      status: UserStatus;
      password_hash: string | null;
      failed_attempts: number;
      locked_until: Date | null;
    }>("select * from auth_find_user_by_email($1)", [email]);
    const r = rows[0];
    return r === undefined
      ? undefined
      : {
          id: r.id,
          tenantId: r.tenant_id,
          role: r.role,
          status: r.status,
          passwordHash: r.password_hash,
          failedAttempts: r.failed_attempts,
          lockedUntil: r.locked_until,
        };
  }

  async findSession(tokenHash: Buffer): Promise<FoundSession | undefined> {
    const { rows } = await this.pool.query<{
      session_id: string;
      tenant_id: string;
      user_id: string;
      expires_at: Date;
      last_used_at: Date;
      revoked_at: Date | null;
      role: Role;
      status: UserStatus;
    }>("select * from auth_find_session($1)", [tokenHash]);
    const r = rows[0];
    return r === undefined
      ? undefined
      : {
          sessionId: r.session_id,
          tenantId: r.tenant_id,
          userId: r.user_id,
          expiresAt: r.expires_at,
          lastUsedAt: r.last_used_at,
          revokedAt: r.revoked_at,
          role: r.role,
          status: r.status,
        };
  }

  async findAccessToken(
    tokenHash: Buffer,
    purpose: "invitation" | "recovery",
  ): Promise<FoundAccessToken | undefined> {
    const { rows } = await this.pool.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      expires_at: Date;
      used_at: Date | null;
      invalidated_at: Date | null;
    }>("select * from auth_find_access_token($1, $2)", [tokenHash, purpose]);
    const r = rows[0];
    return r === undefined
      ? undefined
      : {
          id: r.id,
          tenantId: r.tenant_id,
          userId: r.user_id,
          expiresAt: r.expires_at,
          usedAt: r.used_at,
          invalidatedAt: r.invalidated_at,
        };
  }
}

export interface PublicIdentityRow {
  name: string;
  theme: ThemeId;
  primaryTone: ToneId;
  accentTone: ToneId;
  logoVersion: string | null;
  updatedAt: Date | null;
}

export interface PublicLogoRow {
  content: Buffer;
  contentType: LogoType;
  version: string;
}

/**
 * Reads without a session or a tenant, for the public page of a barbershop link (feature 004,
 * R3). It only calls the two `public_get_*` functions, which return a handful of columns for
 * one slug, and offers no other access outside RLS.
 */
export class PublicLookups {
  constructor(private readonly pool: Pool) {}

  async findIdentity(slug: string): Promise<PublicIdentityRow | undefined> {
    const { rows } = await this.pool.query<{
      name: string;
      theme: ThemeId;
      primary_tone: ToneId;
      accent_tone: ToneId;
      logo_version: string | null;
      updated_at: Date | null;
    }>("select * from public_get_identity($1)", [slug]);
    const r = rows[0];
    return r === undefined
      ? undefined
      : {
          name: r.name,
          theme: r.theme,
          primaryTone: r.primary_tone,
          accentTone: r.accent_tone,
          logoVersion: r.logo_version,
          updatedAt: r.updated_at,
        };
  }

  async findLogo(slug: string): Promise<PublicLogoRow | undefined> {
    const { rows } = await this.pool.query<{
      content: Buffer;
      content_type: LogoType;
      version: string;
    }>("select * from public_get_logo($1)", [slug]);
    const r = rows[0];
    return r === undefined
      ? undefined
      : { content: r.content, contentType: r.content_type, version: r.version };
  }
}

/**
 * The only way to reach business data. Every query runs in a transaction
 * with `app.tenant_id` set; without it RLS returns zero rows
 * (falha fechada, FR-017).
 */
@Injectable()
export class TenantDb {
  private readonly database: Database;

  constructor(@Inject(POOL) private readonly pool: Pool) {
    this.database = drizzle(pool, { schema });
  }

  async transaction<T>(
    tenantId: string,
    fn: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    if (!UUID.test(tenantId)) {
      throw new Error("invalid tenantId: expected a UUID");
    }
    return this.database.transaction(async (tx) => {
      // Parameter, never concatenation; `true` scopes the value to the transaction.
      await tx.execute(
        sql`select set_config('app.tenant_id', ${tenantId}, true)`,
      );
      return fn(tx);
    });
  }

  withoutTenant(): AuthLookups {
    return new AuthLookups(this.pool);
  }

  /** Public, session-less reads of the identity behind a barbershop link. */
  publicLookups(): PublicLookups {
    return new PublicLookups(this.pool);
  }
}
