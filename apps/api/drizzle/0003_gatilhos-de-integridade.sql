-- Trilha de auditoria imutável: nenhum papel altera, remove nem trunca eventos.
CREATE FUNCTION "evento_seguranca_imutavel"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'EVENTO_IMUTAVEL';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "evento_seguranca_sem_alteracao"
  BEFORE UPDATE OR DELETE ON "evento_seguranca"
  FOR EACH ROW EXECUTE FUNCTION "evento_seguranca_imutavel"();--> statement-breakpoint
CREATE TRIGGER "evento_seguranca_sem_truncate"
  BEFORE TRUNCATE ON "evento_seguranca"
  FOR EACH STATEMENT EXECUTE FUNCTION "evento_seguranca_imutavel"();--> statement-breakpoint

-- Integridade de usuario: papel e tenant imutáveis; o último dono ativo não sai (FR-005).
-- O lock consultivo por tenant serializa desativações simultâneas dos donos.
CREATE FUNCTION "usuario_integridade"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.papel <> OLD.papel THEN
    RAISE EXCEPTION 'PAPEL_IMUTAVEL';
  END IF;
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'TENANT_IMUTAVEL';
  END IF;
  IF OLD.papel = 'dono' AND OLD.situacao = 'ativo'
     AND NEW.situacao IN ('desativado', 'anonimizado') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(OLD.tenant_id::text, 0));
    IF NOT EXISTS (
      SELECT 1 FROM public.usuario o
      WHERE o.tenant_id = OLD.tenant_id
        AND o.papel = 'dono'
        AND o.situacao = 'ativo'
        AND o.id <> OLD.id
    ) THEN
      RAISE EXCEPTION 'ULTIMO_DONO';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "usuario_integridade"
  BEFORE UPDATE ON "usuario"
  FOR EACH ROW EXECUTE FUNCTION "usuario_integridade"();
