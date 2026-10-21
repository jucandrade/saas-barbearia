-- Immutable audit trail: no role updates, deletes or truncates events.
CREATE FUNCTION "security_events_immutable"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_EVENT';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "security_events_no_change"
  BEFORE UPDATE OR DELETE ON "security_events"
  FOR EACH ROW EXECUTE FUNCTION "security_events_immutable"();--> statement-breakpoint
CREATE TRIGGER "security_events_no_truncate"
  BEFORE TRUNCATE ON "security_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "security_events_immutable"();--> statement-breakpoint

-- User integrity: role and tenant are immutable; the last active owner cannot leave (FR-005).
-- The per-tenant advisory lock serializes simultaneous deactivations of owners.
CREATE FUNCTION "user_integrity"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.role <> OLD.role THEN
    RAISE EXCEPTION 'IMMUTABLE_ROLE';
  END IF;
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'IMMUTABLE_TENANT';
  END IF;
  IF OLD.role = 'owner' AND OLD.status = 'active'
     AND NEW.status IN ('deactivated', 'anonymized') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(OLD.tenant_id::text, 0));
    IF NOT EXISTS (
      SELECT 1 FROM public.users o
      WHERE o.tenant_id = OLD.tenant_id
        AND o.role = 'owner'
        AND o.status = 'active'
        AND o.id <> OLD.id
    ) THEN
      RAISE EXCEPTION 'LAST_OWNER';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "user_integrity"
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION "user_integrity"();

