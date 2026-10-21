-- Os comandos da equipe do produto usam a conexão administrativa (o papel que migra) e também
-- precisam achar usuários por e-mail antes de conhecer o tenant (R2). Concede EXECUTE a quem migra.
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION auth_buscar_usuario_por_email(text) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION auth_buscar_sessao(bytea) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION auth_buscar_token_acesso(bytea, text) TO %I', current_user);
END
$$;
