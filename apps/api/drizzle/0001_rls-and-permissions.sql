-- FORCE: RLS also applies to the table owner (constitution principle I).
ALTER TABLE "barbershops" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "security_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Minimal privileges for the API role. No DELETE anywhere; the audit trail only accepts INSERT and SELECT.
-- Creating barbershops and units is up to the product team (admin connection).
GRANT USAGE ON SCHEMA public TO app_runtime;--> statement-breakpoint
GRANT SELECT ON "barbershops", "units" TO app_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "users", "access_tokens", "sessions" TO app_runtime;--> statement-breakpoint
GRANT SELECT, INSERT ON "security_events" TO app_runtime;--> statement-breakpoint

-- Login-less role that owns the authentication functions: it reads only what is needed, without a tenant context.
GRANT USAGE ON SCHEMA public TO app_auth;--> statement-breakpoint
GRANT SELECT ON "users", "sessions", "access_tokens" TO app_auth;--> statement-breakpoint
CREATE POLICY "users_auth_read" ON "users" AS PERMISSIVE FOR SELECT TO app_auth USING (true);--> statement-breakpoint
CREATE POLICY "sessions_auth_read" ON "sessions" AS PERMISSIVE FOR SELECT TO app_auth USING (true);--> statement-breakpoint
CREATE POLICY "access_tokens_auth_read" ON "access_tokens" AS PERMISSIVE FOR SELECT TO app_auth USING (true);

