import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { barbearia } from "./barbearia.js";
import { bytea, politicaDoTenant } from "./comum.js";
import { usuario } from "./usuario.js";

/** Sessão opaca no servidor; o token só existe no cliente, aqui fica o hash. */
export const sessao = pgTable(
  "sessao",
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
    tokenHash: bytea("token_hash").notNull(),
    criadaEm: timestamp("criada_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ultimoUsoEm: timestamp("ultimo_uso_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    revogadaEm: timestamp("revogada_em", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("sessao_hash_unico").on(t.tokenHash),
    index("sessao_usuario_idx").on(t.usuarioId),
    politicaDoTenant("sessao_isolamento", sql`${t.tenantId}`),
  ],
).enableRLS();
