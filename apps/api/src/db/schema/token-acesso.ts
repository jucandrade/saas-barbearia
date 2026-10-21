import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { barbearia } from "./barbearia.js";
import { bytea, politicaDoTenant } from "./comum.js";
import { usuario } from "./usuario.js";

export const finalidadeToken = pgEnum("finalidade_token", [
  "convite",
  "recuperacao",
]);

/** Convite (primeiro acesso) e recuperação de senha: uso único, só o hash é guardado. */
export const tokenAcesso = pgTable(
  "token_acesso",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => barbearia.id),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuario.id),
    finalidade: finalidadeToken("finalidade").notNull(),
    tokenHash: bytea("token_hash").notNull(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    usadoEm: timestamp("usado_em", { withTimezone: true }),
    invalidadoEm: timestamp("invalidado_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("token_acesso_hash_unico").on(t.tokenHash),
    index("token_acesso_usuario_idx").on(t.usuarioId),
    politicaDoTenant("token_acesso_isolamento", sql`${t.tenantId}`),
  ],
).enableRLS();
