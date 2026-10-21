-- Funções SECURITY DEFINER mínimas para achar usuário, sessão e token antes de conhecer o tenant (R3).
-- Pertencem a app_auth (sem login e sem BYPASSRLS), cuja leitura é liberada só pelas políticas *_leitura_auth.
GRANT CREATE ON SCHEMA public TO app_auth;--> statement-breakpoint

CREATE FUNCTION "auth_buscar_usuario_por_email"(p_email text)
RETURNS TABLE (
  "id" uuid,
  "tenant_id" uuid,
  "papel" "public"."papel_usuario",
  "situacao" "public"."situacao_usuario",
  "senha_hash" text,
  "tentativas_falhas" integer,
  "bloqueado_ate" timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id, u.tenant_id, u.papel, u.situacao, u.senha_hash, u.tentativas_falhas, u.bloqueado_ate
  FROM public.usuario u
  WHERE u.email = p_email
$$;--> statement-breakpoint

CREATE FUNCTION "auth_buscar_sessao"(p_token_hash bytea)
RETURNS TABLE (
  "sessao_id" uuid,
  "tenant_id" uuid,
  "usuario_id" uuid,
  "expira_em" timestamptz,
  "ultimo_uso_em" timestamptz,
  "revogada_em" timestamptz,
  "papel" "public"."papel_usuario",
  "situacao" "public"."situacao_usuario"
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.id, s.tenant_id, s.usuario_id, s.expira_em, s.ultimo_uso_em, s.revogada_em, u.papel, u.situacao
  FROM public.sessao s
  JOIN public.usuario u ON u.id = s.usuario_id
  WHERE s.token_hash = p_token_hash
$$;--> statement-breakpoint

CREATE FUNCTION "auth_buscar_token_acesso"(p_token_hash bytea, p_finalidade text)
RETURNS TABLE (
  "id" uuid,
  "tenant_id" uuid,
  "usuario_id" uuid,
  "expira_em" timestamptz,
  "usado_em" timestamptz,
  "invalidado_em" timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT t.id, t.tenant_id, t.usuario_id, t.expira_em, t.usado_em, t.invalidado_em
  FROM public.token_acesso t
  WHERE t.token_hash = p_token_hash
    AND t.finalidade = p_finalidade::public.finalidade_token
$$;--> statement-breakpoint

-- Permissões ANTES de passar a posse: depois disso quem migra deixa de ser dono e o REVOKE não teria efeito.
-- Só a API e quem migra (a equipe do produto usa a conexão administrativa, R2) podem executá-las;
-- o acesso de quem migra é concedido depois da troca de dono, abaixo.
REVOKE ALL ON FUNCTION "auth_buscar_usuario_por_email"(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "auth_buscar_sessao"(bytea) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "auth_buscar_token_acesso"(bytea, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "auth_buscar_usuario_por_email"(text) TO app_runtime;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "auth_buscar_sessao"(bytea) TO app_runtime;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "auth_buscar_token_acesso"(bytea, text) TO app_runtime;--> statement-breakpoint

ALTER FUNCTION "auth_buscar_usuario_por_email"(text) OWNER TO app_auth;--> statement-breakpoint
ALTER FUNCTION "auth_buscar_sessao"(bytea) OWNER TO app_auth;--> statement-breakpoint
ALTER FUNCTION "auth_buscar_token_acesso"(bytea, text) OWNER TO app_auth;--> statement-breakpoint
-- A troca de dono reescreve a entrada implícita do dono antigo; quem migra recebe o acesso de volta,
-- agindo por um instante como app_auth (o migrador tem SET nesse papel, sem herdar seus privilégios).
DO $$
DECLARE
  migrador text := current_user;
BEGIN
  SET LOCAL ROLE app_auth;
  EXECUTE format('GRANT EXECUTE ON FUNCTION auth_buscar_usuario_por_email(text) TO %I', migrador);
  EXECUTE format('GRANT EXECUTE ON FUNCTION auth_buscar_sessao(bytea) TO %I', migrador);
  EXECUTE format('GRANT EXECUTE ON FUNCTION auth_buscar_token_acesso(bytea, text) TO %I', migrador);
  RESET ROLE;
END
$$;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM app_auth;
