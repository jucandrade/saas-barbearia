CREATE TYPE "public"."branding_theme" AS ENUM('noir', 'day', 'leather');--> statement-breakpoint
CREATE TYPE "public"."branding_tone" AS ENUM('gold', 'terracotta', 'sage', 'blue', 'violet', 'rose', 'teal', 'orange', 'wine', 'graphite');--> statement-breakpoint
CREATE TYPE "public"."logo_type" AS ENUM('image/png', 'image/jpeg', 'image/webp');--> statement-breakpoint
CREATE TYPE "public"."branding_event_type" AS ENUM('branding_updated', 'logo_changed', 'logo_removed', 'branding_reset');--> statement-breakpoint
CREATE TABLE "barbershop_branding" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"theme" "branding_theme" DEFAULT 'noir' NOT NULL,
	"primary_tone" "branding_tone" DEFAULT 'gold' NOT NULL,
	"accent_tone" "branding_tone" DEFAULT 'gold' NOT NULL,
	"logo_version" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "barbershop_branding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "barbershop_logos" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL,
	"content_type" "logo_type" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barbershop_logos_size" CHECK (octet_length("barbershop_logos"."content") between 1 and 524288),
	CONSTRAINT "barbershop_logos_dimensions" CHECK (least("barbershop_logos"."width", "barbershop_logos"."height") >= 64 and greatest("barbershop_logos"."width", "barbershop_logos"."height") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "barbershop_logos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "branding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "branding_event_type" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branding_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- public_slug (R2): created nullable, filled for the existing barbershops from their names, and only
-- then made NOT NULL; the unique constraint and the CHECK further down need the filled column.
ALTER TABLE "barbershops" ADD COLUMN "public_slug" text;--> statement-breakpoint
-- The backfill runs as the table owner, to whom FORCE ROW LEVEL SECURITY also applies, so the
-- force is lifted for this statement only (the migration is a single transaction).
ALTER TABLE "barbershops" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Same idea as slugify() of @barbearia/domain (lowercase, accents and apostrophes dropped, runs of
-- other characters become one hyphen, at most 40 characters, "-2", "-3" on collisions). It can differ
-- from slugify() in rare cases; it only runs once, for barbershops that predate the column.
UPDATE "barbershops" AS b SET "public_slug" = d.slug
FROM (
  SELECT id,
    CASE WHEN rn = 1 THEN slug
         ELSE trim(both '-' from left(slug, 40 - char_length(rn::text) - 1)) || '-' || rn::text
    END AS slug
  FROM (
    SELECT id, slug, row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS rn
    FROM (
      SELECT id, created_at,
        CASE WHEN char_length(s) >= 3 THEN s ELSE 'barbearia-' || left(id::text, 8) END AS slug
      FROM (
        SELECT id, created_at,
          trim(both '-' from left(trim(both '-' from regexp_replace(
            translate(replace(replace(lower(name), chr(39), ''), chr(8217), ''),
                      'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
            '[^a-z0-9]+', '-', 'g')), 40)) AS s
        FROM "barbershops"
      ) normalized
    ) candidates
  ) numbered
) AS d
WHERE b.id = d.id;--> statement-breakpoint
ALTER TABLE "barbershops" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Safety net: a barbershop inserted without a slug still gets a valid one. Provisioning sets the real one.
ALTER TABLE "barbershops" ALTER COLUMN "public_slug" SET DEFAULT 'barbearia-' || substr(gen_random_uuid()::text, 1, 8);--> statement-breakpoint
ALTER TABLE "barbershops" ALTER COLUMN "public_slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "barbershop_branding" ADD CONSTRAINT "barbershop_branding_tenant_id_barbershops_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbershops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barbershop_logos" ADD CONSTRAINT "barbershop_logos_tenant_id_barbershops_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbershops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branding_events" ADD CONSTRAINT "branding_events_tenant_id_barbershops_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbershops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branding_events_tenant_idx" ON "branding_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_public_slug" UNIQUE("public_slug");--> statement-breakpoint
ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_public_slug_format" CHECK ("barbershops"."public_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("barbershops"."public_slug") between 3 and 40);--> statement-breakpoint
CREATE POLICY "barbershop_branding_isolation" ON "barbershop_branding" AS PERMISSIVE FOR ALL TO public USING ("barbershop_branding"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("barbershop_branding"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "barbershop_logos_isolation" ON "barbershop_logos" AS PERMISSIVE FOR ALL TO public USING ("barbershop_logos"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("barbershop_logos"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "branding_events_isolation" ON "branding_events" AS PERMISSIVE FOR ALL TO public USING ("branding_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("branding_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- FORCE: RLS also applies to the table owner (constitution principle I).
ALTER TABLE "barbershop_branding" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "barbershop_logos" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "branding_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Minimal privileges for the API role. The owner can rename the barbershop (only the name column);
-- the branding row is never deleted (restoring the default rewrites it); the logo is a real delete;
-- the audit trail only accepts INSERT and SELECT.
GRANT UPDATE ("name") ON "barbershops" TO app_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "barbershop_branding" TO app_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "barbershop_logos" TO app_runtime;--> statement-breakpoint
GRANT SELECT, INSERT ON "branding_events" TO app_runtime;--> statement-breakpoint

-- Immutable audit trail: no role updates, deletes or truncates branding events.
CREATE FUNCTION "branding_events_immutable"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_EVENT';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "branding_events_no_change"
  BEFORE UPDATE OR DELETE ON "branding_events"
  FOR EACH ROW EXECUTE FUNCTION "branding_events_immutable"();--> statement-breakpoint
CREATE TRIGGER "branding_events_no_truncate"
  BEFORE TRUNCATE ON "branding_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "branding_events_immutable"();--> statement-breakpoint

-- Public read without a session (R3). The login-less role app_public reads only what the two
-- functions below need: the name and slug of a barbershop, its branding and its logo. No table is
-- readable by an anonymous visitor: the API calls the functions on the visitor's behalf.
GRANT USAGE ON SCHEMA public TO app_public;--> statement-breakpoint
GRANT SELECT ("id", "name", "public_slug") ON "barbershops" TO app_public;--> statement-breakpoint
GRANT SELECT ON "barbershop_branding", "barbershop_logos" TO app_public;--> statement-breakpoint
CREATE POLICY "barbershops_public_read" ON "barbershops" AS PERMISSIVE FOR SELECT TO app_public USING (true);--> statement-breakpoint
CREATE POLICY "barbershop_branding_public_read" ON "barbershop_branding" AS PERMISSIVE FOR SELECT TO app_public USING (true);--> statement-breakpoint
CREATE POLICY "barbershop_logos_public_read" ON "barbershop_logos" AS PERMISSIVE FOR SELECT TO app_public USING (true);--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO app_public;--> statement-breakpoint

-- Identity of the barbershop behind a link. No row = the link does not exist. A barbershop that never
-- customized anything comes back with the product default (Noir, gold, gold). Nothing else is exposed.
CREATE FUNCTION "public_get_identity"(p_slug text)
RETURNS TABLE (
  "name" text,
  "theme" "public"."branding_theme",
  "primary_tone" "public"."branding_tone",
  "accent_tone" "public"."branding_tone",
  "logo_version" text,
  "updated_at" timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT b.name,
         COALESCE(br.theme, 'noir'::public.branding_theme),
         COALESCE(br.primary_tone, 'gold'::public.branding_tone),
         COALESCE(br.accent_tone, 'gold'::public.branding_tone),
         br.logo_version,
         br.updated_at
  FROM public.barbershops b
  LEFT JOIN public.barbershop_branding br ON br.tenant_id = b.id
  WHERE b.public_slug = p_slug
$$;--> statement-breakpoint

-- The logo behind a link; no row when the link does not exist or there is no logo.
CREATE FUNCTION "public_get_logo"(p_slug text)
RETURNS TABLE (
  "content" bytea,
  "content_type" "public"."logo_type",
  "version" text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT l.content, l.content_type, l.version
  FROM public.barbershops b
  JOIN public.barbershop_logos l ON l.tenant_id = b.id
  WHERE b.public_slug = p_slug
$$;--> statement-breakpoint

-- Privileges BEFORE handing over ownership: afterwards the migrator no longer owns the functions and
-- REVOKE would do nothing. Only the API (and, below, the migrator) may execute them.
REVOKE ALL ON FUNCTION "public_get_identity"(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public_get_logo"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public_get_identity"(text) TO app_runtime;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public_get_logo"(text) TO app_runtime;--> statement-breakpoint
ALTER FUNCTION "public_get_identity"(text) OWNER TO app_public;--> statement-breakpoint
ALTER FUNCTION "public_get_logo"(text) OWNER TO app_public;--> statement-breakpoint
-- Changing the owner rewrites the old owner's implicit entry; the migrator gets access back by acting
-- as app_public for an instant (it has SET on that role without inheriting its privileges).
DO $$
DECLARE
  migrador text := current_user;
BEGIN
  SET LOCAL ROLE app_public;
  EXECUTE format('GRANT EXECUTE ON FUNCTION public_get_identity(text) TO %I', migrador);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public_get_logo(text) TO %I', migrador);
  RESET ROLE;
END
$$;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM app_public;
