CREATE TYPE "public"."ator_tipo" AS ENUM('usuario', 'plataforma', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento_seguranca" AS ENUM('barbearia_provisionada', 'convite_enviado', 'convite_aceito', 'login_sucesso', 'login_falha', 'logout', 'senha_recuperacao_solicitada', 'senha_redefinida', 'usuario_desativado', 'usuario_reativado', 'usuario_anonimizado');--> statement-breakpoint
CREATE TYPE "public"."finalidade_token" AS ENUM('convite', 'recuperacao');--> statement-breakpoint
CREATE TYPE "public"."papel_usuario" AS ENUM('dono', 'barbeiro');--> statement-breakpoint
CREATE TYPE "public"."situacao_usuario" AS ENUM('convidado', 'ativo', 'desativado', 'anonimizado');--> statement-breakpoint
CREATE TABLE "barbearia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barbearia_nome_tamanho" CHECK (char_length("barbearia"."nome") between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "barbearia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evento_seguranca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"tipo" "tipo_evento_seguranca" NOT NULL,
	"ator_tipo" "ator_tipo" NOT NULL,
	"ator_usuario_id" uuid,
	"alvo_usuario_id" uuid,
	"detalhe" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evento_seguranca" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"revogada_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sessao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "token_acesso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"finalidade" "finalidade_token" NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"invalidado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "token_acesso" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "unidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"fuso_horario" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unidade_nome_tamanho" CHECK (char_length("unidade"."nome") between 1 and 120),
	CONSTRAINT "unidade_fuso_preenchido" CHECK (char_length("unidade"."fuso_horario") > 0)
);
--> statement-breakpoint
ALTER TABLE "unidade" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"papel" "papel_usuario" NOT NULL,
	"situacao" "situacao_usuario" NOT NULL,
	"senha_hash" text,
	"tentativas_falhas" integer DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"desativado_em" timestamp with time zone,
	"anonimizado_em" timestamp with time zone,
	CONSTRAINT "usuario_nome_tamanho" CHECK (char_length("usuario"."nome") between 1 and 120),
	CONSTRAINT "usuario_email_normalizado" CHECK ("usuario"."email" = lower("usuario"."email")),
	CONSTRAINT "usuario_ativo_tem_senha" CHECK ("usuario"."situacao" <> 'ativo' or "usuario"."senha_hash" is not null),
	CONSTRAINT "usuario_anonimizado_sem_dados" CHECK ("usuario"."situacao" <> 'anonimizado' or ("usuario"."senha_hash" is null and "usuario"."anonimizado_em" is not null))
);
--> statement-breakpoint
ALTER TABLE "usuario" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evento_seguranca" ADD CONSTRAINT "evento_seguranca_tenant_id_barbearia_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbearia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_tenant_id_barbearia_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbearia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_acesso" ADD CONSTRAINT "token_acesso_tenant_id_barbearia_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbearia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_acesso" ADD CONSTRAINT "token_acesso_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidade" ADD CONSTRAINT "unidade_tenant_id_barbearia_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbearia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_tenant_id_barbearia_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."barbearia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evento_seguranca_tenant_idx" ON "evento_seguranca" USING btree ("tenant_id","ocorrido_em");--> statement-breakpoint
CREATE UNIQUE INDEX "sessao_hash_unico" ON "sessao" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessao_usuario_idx" ON "sessao" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "token_acesso_hash_unico" ON "token_acesso" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "token_acesso_usuario_idx" ON "token_acesso" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "unidade_tenant_idx" ON "unidade" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_email_unico" ON "usuario" USING btree ("email");--> statement-breakpoint
CREATE INDEX "usuario_tenant_idx" ON "usuario" USING btree ("tenant_id");--> statement-breakpoint
CREATE POLICY "barbearia_isolamento" ON "barbearia" AS PERMISSIVE FOR ALL TO public USING ("barbearia"."id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("barbearia"."id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "evento_seguranca_leitura" ON "evento_seguranca" AS PERMISSIVE FOR SELECT TO public USING ("evento_seguranca"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "evento_seguranca_escrita" ON "evento_seguranca" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("evento_seguranca"."tenant_id" is null or "evento_seguranca"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "sessao_isolamento" ON "sessao" AS PERMISSIVE FOR ALL TO public USING ("sessao"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("sessao"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "token_acesso_isolamento" ON "token_acesso" AS PERMISSIVE FOR ALL TO public USING ("token_acesso"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("token_acesso"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "unidade_isolamento" ON "unidade" AS PERMISSIVE FOR ALL TO public USING ("unidade"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("unidade"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "usuario_isolamento" ON "usuario" AS PERMISSIVE FOR ALL TO public USING ("usuario"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("usuario"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);