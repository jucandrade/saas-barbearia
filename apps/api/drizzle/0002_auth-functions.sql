-- Minimal SECURITY DEFINER functions to find a user, session or token before the tenant is known (R3).
-- They belong to app_auth (no login, no BYPASSRLS), whose read access is granted only by the *_auth_read policies.
GRANT CREATE ON SCHEMA public TO app_auth;--> statement-breakpoint

CREATE FUNCTION "auth_find_user_by_email"(p_email text)
RETURNS TABLE (
  "id" uuid,
  "tenant_id" uuid,
  "role" "public"."user_role",
  "status" "public"."user_status",
  "password_hash" text,
  "failed_attempts" integer,
  "locked_until" timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id, u.tenant_id, u.role, u.status, u.password_hash, u.failed_attempts, u.locked_until
  FROM public.users u
  WHERE u.email = p_email
$$;--> statement-breakpoint

CREATE FUNCTION "auth_find_session"(p_token_hash bytea)
RETURNS TABLE (
  "session_id" uuid,
  "tenant_id" uuid,
  "user_id" uuid,
  "expires_at" timestamptz,
  "last_used_at" timestamptz,
  "revoked_at" timestamptz,
  "role" "public"."user_role",
  "status" "public"."user_status"
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.id, s.tenant_id, s.user_id, s.expires_at, s.last_used_at, s.revoked_at, u.role, u.status
  FROM public.sessions s
  JOIN public.users u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash
$$;--> statement-breakpoint

CREATE FUNCTION "auth_find_access_token"(p_token_hash bytea, p_purpose text)
RETURNS TABLE (
  "id" uuid,
  "tenant_id" uuid,
  "user_id" uuid,
  "expires_at" timestamptz,
  "used_at" timestamptz,
  "invalidated_at" timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT t.id, t.tenant_id, t.user_id, t.expires_at, t.used_at, t.invalidated_at
  FROM public.access_tokens t
  WHERE t.token_hash = p_token_hash
    AND t.purpose = p_purpose::public.token_purpose
$$;--> statement-breakpoint

-- Privileges BEFORE handing over ownership: afterwards the migrator no longer owns the function and REVOKE would do nothing.
-- Only the API and the migrator (the product team uses the admin connection, R2) may execute them;
-- the migrator's access is granted after the ownership change, below.
REVOKE ALL ON FUNCTION "auth_find_user_by_email"(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "auth_find_session"(bytea) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "auth_find_access_token"(bytea, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "auth_find_user_by_email"(text) TO app_runtime;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "auth_find_session"(bytea) TO app_runtime;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "auth_find_access_token"(bytea, text) TO app_runtime;--> statement-breakpoint

ALTER FUNCTION "auth_find_user_by_email"(text) OWNER TO app_auth;--> statement-breakpoint
ALTER FUNCTION "auth_find_session"(bytea) OWNER TO app_auth;--> statement-breakpoint
ALTER FUNCTION "auth_find_access_token"(bytea, text) OWNER TO app_auth;--> statement-breakpoint
-- Changing the owner rewrites the old owner's implicit entry; the migrator gets access back by
-- acting as app_auth for an instant (the migrator has SET on that role without inheriting its privileges).
DO $$
DECLARE
  migrador text := current_user;
BEGIN
  SET LOCAL ROLE app_auth;
  EXECUTE format('GRANT EXECUTE ON FUNCTION auth_find_user_by_email(text) TO %I', migrador);
  EXECUTE format('GRANT EXECUTE ON FUNCTION auth_find_session(bytea) TO %I', migrador);
  EXECUTE format('GRANT EXECUTE ON FUNCTION auth_find_access_token(bytea, text) TO %I', migrador);
  RESET ROLE;
END
$$;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM app_auth;

