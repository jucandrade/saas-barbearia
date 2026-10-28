import {
  barbershop,
  barbershopBranding,
  barbershopLogo,
  brandingEvent,
  catalogEvent,
  securityEvent,
  service,
  serviceCategory,
  serviceExecutor,
  session,
  accessToken,
  unit,
  user,
} from "../../../src/db/schema/index.js";
import { createHash } from "node:crypto";
import { normalizeName, slugify } from "@barbearia/domain";
import {
  generateToken,
  hashToken,
} from "../../../src/identity/security/tokens.js";
import { withTenantAdmin, adminConnection, newUuid } from "./db.js";

export interface BarbershopCreated {
  barbershopId: string;
  unitId: string;
  /** Public link identifier, unique per call. */
  slug: string;
}

/** A unique, valid public slug for a barbershop name (the suffix avoids collisions between tests). */
export function slugFor(name: string): string {
  return `${slugify(name).slice(0, 30)}-${newUuid().slice(0, 8)}`;
}

/** Creates a barbershop and its initial unit (the UUID is born in the application, before the INSERTs). */
export async function createBarbershop(
  name = "Barbearia Teste",
  timezone = "America/Sao_Paulo",
  slug = slugFor(name),
): Promise<BarbershopCreated> {
  const barbershopId = newUuid();
  const unitId = newUuid();
  await withTenantAdmin(barbershopId, async (tx) => {
    await tx
      .insert(barbershop)
      .values({ id: barbershopId, name, publicSlug: slug });
    await tx.insert(unit).values({
      id: unitId,
      tenantId: barbershopId,
      name: "Main",
      timezone: timezone,
    });
  });
  return { barbershopId, unitId, slug };
}

export interface UserToCreate {
  tenantId: string;
  name?: string;
  email?: string;
  role?: "owner" | "barber";
  status?: "invited" | "active" | "deactivated" | "anonymized";
  passwordHash?: string | null;
}

export async function createUser(data: UserToCreate): Promise<string> {
  const id = newUuid();
  const status = data.status ?? "active";
  await withTenantAdmin(data.tenantId, async (tx) => {
    await tx.insert(user).values({
      id,
      tenantId: data.tenantId,
      name: data.name ?? "Test User",
      email: data.email ?? `${id}@example.com`,
      role: data.role ?? "barber",
      status,
      passwordHash:
        data.passwordHash === undefined
          ? status === "active" || status === "deactivated"
            ? "test-hash"
            : null
          : data.passwordHash,
      anonymizedAt: status === "anonymized" ? new Date() : null,
    });
  });
  return id;
}

export interface TokenToCreate {
  tenantId: string;
  userId: string;
  purpose?: "invitation" | "recovery";
  expiresAt: Date;
  usedAt?: Date | null;
  invalidatedAt?: Date | null;
}

/** Creates an access token straight in the database and returns the plain token. */
export async function createAccessToken(data: TokenToCreate): Promise<string> {
  const token = generateToken();
  await withTenantAdmin(data.tenantId, async (tx) => {
    await tx.insert(accessToken).values({
      tenantId: data.tenantId,
      userId: data.userId,
      purpose: data.purpose ?? "invitation",
      tokenHash: hashToken(token),
      expiresAt: data.expiresAt,
      usedAt: data.usedAt ?? null,
      invalidatedAt: data.invalidatedAt ?? null,
    });
  });
  return token;
}

/** Creates a session straight in the database (bypassing login) and returns the plain token. */
export async function createSessionInDatabase(data: {
  tenantId: string;
  userId: string;
  expiresAt?: Date;
}): Promise<string> {
  const token = generateToken();
  await withTenantAdmin(data.tenantId, async (tx) => {
    await tx.insert(session).values({
      tenantId: data.tenantId,
      userId: data.userId,
      tokenHash: hashToken(token),
      expiresAt: data.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    });
  });
  return token;
}

/** Creates a security event straight in the database, for the isolation tests. */
export async function createEventInDatabase(
  tenantId: string | null,
): Promise<void> {
  if (tenantId === null) {
    await adminConnection().query(
      "insert into security_events (tenant_id, type, actor_type) values (null, 'login_failure', 'system')",
    );
    return;
  }
  await withTenantAdmin(tenantId, async (tx) => {
    await tx.insert(securityEvent).values({
      tenantId,
      type: "login_success",
      actorType: "system",
    });
  });
}

export interface CategoryToCreate {
  tenantId: string;
  name?: string;
  position?: number;
}

/** Creates a service category straight in the database and returns its id. */
export async function createCategory(data: CategoryToCreate): Promise<string> {
  const id = newUuid();
  const name = data.name ?? `Category ${id.slice(0, 8)}`;
  await withTenantAdmin(data.tenantId, async (tx) => {
    await tx.insert(serviceCategory).values({
      id,
      tenantId: data.tenantId,
      name,
      nameKey: normalizeName(name),
      position: data.position ?? 0,
    });
  });
  return id;
}

export interface ServiceToCreate {
  tenantId: string;
  categoryId: string;
  name?: string;
  description?: string | null;
  durationMinutes?: number;
  priceCents?: number;
  status?: "active" | "deactivated";
}

/** Creates a service straight in the database and returns its id. */
export async function createService(data: ServiceToCreate): Promise<string> {
  const id = newUuid();
  const name = data.name ?? `Service ${id.slice(0, 8)}`;
  await withTenantAdmin(data.tenantId, async (tx) => {
    await tx.insert(service).values({
      id,
      tenantId: data.tenantId,
      categoryId: data.categoryId,
      name,
      nameKey: normalizeName(name),
      description: data.description ?? null,
      durationMinutes: data.durationMinutes ?? 30,
      priceCents: data.priceCents ?? 5000,
      status: data.status ?? "active",
    });
  });
  return id;
}

export interface ExecutorToLink {
  tenantId: string;
  serviceId: string;
  userId: string;
  priceCents?: number | null;
  durationMinutes?: number | null;
}

/** Links a user to a service straight in the database, with optional specific values. */
export async function linkExecutor(data: ExecutorToLink): Promise<void> {
  await withTenantAdmin(data.tenantId, async (tx) => {
    await tx.insert(serviceExecutor).values({
      tenantId: data.tenantId,
      serviceId: data.serviceId,
      userId: data.userId,
      priceCents: data.priceCents ?? null,
      durationMinutes: data.durationMinutes ?? null,
    });
  });
}

/** Creates a catalog event straight in the database, for the isolation tests. */
export async function createCatalogEventInDatabase(
  tenantId: string,
  actorUserId: string,
): Promise<void> {
  await withTenantAdmin(tenantId, async (tx) => {
    await tx.insert(catalogEvent).values({
      tenantId,
      type: "category_created",
      actorUserId,
    });
  });
}

export interface BrandingToCreate {
  tenantId: string;
  theme?: "noir" | "day" | "leather";
  primaryTone?: (typeof barbershopBranding.$inferInsert)["primaryTone"];
  accentTone?: (typeof barbershopBranding.$inferInsert)["accentTone"];
  logoVersion?: string | null;
}

/** Saves a customized identity straight in the database. */
export async function createBranding(data: BrandingToCreate): Promise<void> {
  await withTenantAdmin(data.tenantId, async (tx) => {
    await tx.insert(barbershopBranding).values({
      tenantId: data.tenantId,
      theme: data.theme ?? "day",
      primaryTone: data.primaryTone ?? "blue",
      accentTone: data.accentTone ?? "gold",
      logoVersion: data.logoVersion ?? null,
    });
  });
}

export interface LogoToCreate {
  tenantId: string;
  /** Raw bytes; the database only checks the size, the content is validated by the application. */
  content?: Buffer;
  contentType?: "image/png" | "image/jpeg" | "image/webp";
  width?: number;
  height?: number;
}

/** Stores a logo straight in the database and returns its version. */
export async function createLogo(data: LogoToCreate): Promise<string> {
  const content = data.content ?? Buffer.from("logo-bytes");
  const version = createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, 16);
  await withTenantAdmin(data.tenantId, async (tx) => {
    await tx.insert(barbershopLogo).values({
      tenantId: data.tenantId,
      content,
      contentType: data.contentType ?? "image/png",
      width: data.width ?? 200,
      height: data.height ?? 200,
      version,
    });
  });
  return version;
}

/** Creates a branding event straight in the database, for the isolation tests. */
export async function createBrandingEventInDatabase(
  tenantId: string,
  actorUserId: string,
): Promise<void> {
  await withTenantAdmin(tenantId, async (tx) => {
    await tx.insert(brandingEvent).values({
      tenantId,
      type: "branding_updated",
      actorUserId,
    });
  });
}
