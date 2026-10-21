-- FORCE: a RLS vale também para o dono das tabelas (princípio I da constitution).
ALTER TABLE "barbearia" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "unidade" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usuario" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "token_acesso" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessao" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evento_seguranca" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Permissões mínimas do papel da API. Nenhum DELETE; a trilha de auditoria só aceita INSERT e SELECT.
-- A criação da barbearia e da unidade é da equipe do produto (conexão administrativa).
GRANT USAGE ON SCHEMA public TO app_runtime;--> statement-breakpoint
GRANT SELECT ON "barbearia", "unidade" TO app_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "usuario", "token_acesso", "sessao" TO app_runtime;--> statement-breakpoint
GRANT SELECT, INSERT ON "evento_seguranca" TO app_runtime;--> statement-breakpoint

-- Papel sem login que é dono das funções de autenticação: lê só o necessário, sem contexto de tenant.
GRANT USAGE ON SCHEMA public TO app_auth;--> statement-breakpoint
GRANT SELECT ON "usuario", "sessao", "token_acesso" TO app_auth;--> statement-breakpoint
CREATE POLICY "usuario_leitura_auth" ON "usuario" AS PERMISSIVE FOR SELECT TO app_auth USING (true);--> statement-breakpoint
CREATE POLICY "sessao_leitura_auth" ON "sessao" AS PERMISSIVE FOR SELECT TO app_auth USING (true);--> statement-breakpoint
CREATE POLICY "token_acesso_leitura_auth" ON "token_acesso" AS PERMISSIVE FOR SELECT TO app_auth USING (true);
