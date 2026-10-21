CREATE TYPE "public"."actor_type" AS ENUM('user', 'platform', 'system');--> statement-breakpoint
CREATE TYPE "public"."security_event_type" AS ENUM('barbershop_provisioned', 'invitation_sent', 'invitation_accepted', 'login_success', 'login_failure', 'logout', 'password_recovery_requested', 'password_reset', 'user_deactivated', 'user_reactivated', 'user_anonymized');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('invitation', 'recovery');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'barber');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'deactivated', 'anonymized');--> statement-breakpoint
CREATE TABLE "barbershops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barbershops_name_length" CHECK (char_length("barbershops"."name") between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "barbershops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"type" "security_event_type" NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" uuid,
	"target_user_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "security_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_name_length" CHECK (char_length("units"."name") between 1 and 120),
	CONSTRAINT "unit_timezone_not_empty" CHECK (char_length("units"."timezone") > 0)
);
--> statement-breakpoint
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "user_status" NOT NULL,
	"password_hash" text,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	CONSTRAINT "users_name_length" CHECK (char_length("users"."name") between 1 and 120),
	CONSTRAINT "users_email_normalized" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "user_active_has_password" CHECK ("users"."status" <> 'active' or "users"."password_hash" is not null),
	CONSTRAINT "users_anonymized_without_data" CHECK ("users"."status" <> 'anonymized' or ("users"."password_hash" is null and "users"."anonymized_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_tenant_id_barbershops_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbershops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_barbershops_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbershops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_tenant_id_barbershops_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbershops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_tenant_id_barbershops_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbershops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_barbershops_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbershops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "security_events_tenant_idx" ON "security_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_tokens_hash_unique" ON "access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "access_tokens_user_idx" ON "access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "units_tenant_idx" ON "units" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_tenant_idx" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE POLICY "barbershops_isolation" ON "barbershops" AS PERMISSIVE FOR ALL TO public USING ("barbershops"."id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("barbershops"."id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "security_events_read" ON "security_events" AS PERMISSIVE FOR SELECT TO public USING ("security_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "security_events_write" ON "security_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("security_events"."tenant_id" is null or "security_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "sessions_isolation" ON "sessions" AS PERMISSIVE FOR ALL TO public USING ("sessions"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("sessions"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "access_tokens_isolation" ON "access_tokens" AS PERMISSIVE FOR ALL TO public USING ("access_tokens"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("access_tokens"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "units_isolation" ON "units" AS PERMISSIVE FOR ALL TO public USING ("units"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("units"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "users_isolation" ON "users" AS PERMISSIVE FOR ALL TO public USING ("users"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("users"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);