CREATE TYPE "public"."service_status" AS ENUM('active', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."catalog_event_type" AS ENUM('category_created', 'category_renamed', 'categories_reordered', 'category_deleted', 'service_created', 'service_updated', 'service_deactivated', 'service_reactivated', 'executor_linked', 'executor_updated', 'executor_unlinked');--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_categories_tenant_id_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "service_categories_name_key" UNIQUE("tenant_id","name_key"),
	CONSTRAINT "service_categories_name_length" CHECK (char_length("service_categories"."name") between 1 and 80),
	CONSTRAINT "service_categories_position" CHECK ("service_categories"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "service_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"status" "service_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_tenant_id_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "services_name_key" UNIQUE("tenant_id","name_key"),
	CONSTRAINT "services_name_length" CHECK (char_length("services"."name") between 1 and 80),
	CONSTRAINT "services_description_length" CHECK ("services"."description" is null or char_length("services"."description") between 1 and 500),
	CONSTRAINT "services_duration" CHECK ("services"."duration_minutes" between 5 and 480 and "services"."duration_minutes" % 5 = 0),
	CONSTRAINT "services_price" CHECK ("services"."price_cents" between 0 and 1000000)
);
--> statement-breakpoint
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_executors" (
	"tenant_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"price_cents" integer,
	"duration_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_executors_pk" PRIMARY KEY("service_id","user_id"),
	CONSTRAINT "service_executors_price" CHECK ("service_executors"."price_cents" is null or "service_executors"."price_cents" between 0 and 1000000),
	CONSTRAINT "service_executors_duration" CHECK ("service_executors"."duration_minutes" is null or ("service_executors"."duration_minutes" between 5 and 480 and "service_executors"."duration_minutes" % 5 = 0))
);
--> statement-breakpoint
ALTER TABLE "service_executors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "catalog_event_type" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"service_id" uuid,
	"category_id" uuid,
	"target_user_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- The composite foreign keys below point at this index, so it must exist first.
CREATE UNIQUE INDEX "users_tenant_id_id_idx" ON "users" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_tenant_id_barbershops_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbershops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_barbershops_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbershops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."service_categories"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_executors" ADD CONSTRAINT "service_executors_tenant_id_barbershops_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbershops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_executors" ADD CONSTRAINT "service_executors_service_fk" FOREIGN KEY ("tenant_id","service_id") REFERENCES "public"."services"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_executors" ADD CONSTRAINT "service_executors_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_events" ADD CONSTRAINT "catalog_events_tenant_id_barbershops_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbershops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_categories_tenant_idx" ON "service_categories" USING btree ("tenant_id","position");--> statement-breakpoint
CREATE INDEX "services_tenant_idx" ON "services" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE INDEX "service_executors_user_idx" ON "service_executors" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "catalog_events_tenant_idx" ON "catalog_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE POLICY "service_categories_isolation" ON "service_categories" AS PERMISSIVE FOR ALL TO public USING ("service_categories"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("service_categories"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "services_isolation" ON "services" AS PERMISSIVE FOR ALL TO public USING ("services"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("services"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "service_executors_isolation" ON "service_executors" AS PERMISSIVE FOR ALL TO public USING ("service_executors"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("service_executors"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "catalog_events_isolation" ON "catalog_events" AS PERMISSIVE FOR ALL TO public USING ("catalog_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("catalog_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

-- FORCE: RLS also applies to the table owner (constitution principle I).
ALTER TABLE "service_categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "services" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_executors" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "catalog_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Minimal privileges for the API role. Services are never deleted (FR-005): no DELETE on them.
-- Categories and executor links have no history to keep, so they can be removed.
-- The audit trail only accepts INSERT and SELECT.
GRANT SELECT, INSERT, UPDATE ON "services" TO app_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "service_categories", "service_executors" TO app_runtime;--> statement-breakpoint
GRANT SELECT, INSERT ON "catalog_events" TO app_runtime;--> statement-breakpoint

-- Immutable audit trail: no role updates, deletes or truncates catalog events.
CREATE FUNCTION "catalog_events_immutable"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_EVENT';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "catalog_events_no_change"
  BEFORE UPDATE OR DELETE ON "catalog_events"
  FOR EACH ROW EXECUTE FUNCTION "catalog_events_immutable"();--> statement-breakpoint
CREATE TRIGGER "catalog_events_no_truncate"
  BEFORE TRUNCATE ON "catalog_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "catalog_events_immutable"();
