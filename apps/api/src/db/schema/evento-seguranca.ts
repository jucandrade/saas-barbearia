import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { barbearia } from "./barbearia.js";
import { tenantDoContexto } from "./comum.js";

export const tipoEventoSeguranca = pgEnum("tipo_evento_seguranca", [
  "barbearia_provisionada",
  "convite_enviado",
  "convite_aceito",
  "login_sucesso",
  "login_falha",
  "logout",
  "senha_recuperacao_solicitada",
  "senha_redefinida",
  "usuario_desativado",
  "usuario_reativado",
  "usuario_anonimizado",
]);

export const atorTipo = pgEnum("ator_tipo", [
  "usuario",
  "plataforma",
  "sistema",
]);

/**
 * Trilha de auditoria imutável. `tenant_id` é nulo só para falhas de login de
 * e-mail inexistente; esses eventos não aparecem a nenhuma barbearia. Nunca
 * guarda e-mail, nome, senha, token nem IP.
 */
export const eventoSeguranca = pgTable(
  "evento_seguranca",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => barbearia.id),
    tipo: tipoEventoSeguranca("tipo").notNull(),
    atorTipo: atorTipo("ator_tipo").notNull(),
    atorUsuarioId: uuid("ator_usuario_id"),
    alvoUsuarioId: uuid("alvo_usuario_id"),
    detalhe: jsonb("detalhe")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ocorridoEm: timestamp("ocorrido_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("evento_seguranca_tenant_idx").on(t.tenantId, t.ocorridoEm),
    pgPolicy("evento_seguranca_leitura", {
      as: "permissive",
      for: "select",
      using: sql`${t.tenantId} = ${tenantDoContexto}`,
    }),
    pgPolicy("evento_seguranca_escrita", {
      as: "permissive",
      for: "insert",
      withCheck: sql`${t.tenantId} is null or ${t.tenantId} = ${tenantDoContexto}`,
    }),
  ],
).enableRLS();
