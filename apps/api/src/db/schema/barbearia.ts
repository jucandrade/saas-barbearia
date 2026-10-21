import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { politicaDoTenant } from "./comum.js";

/** O tenant. Seu `id` é o `tenant_id` das demais tabelas. */
export const barbearia = pgTable(
  "barbearia",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    nome: text("nome").notNull(),
    criadaEm: timestamp("criada_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "barbearia_nome_tamanho",
      sql`char_length(${t.nome}) between 1 and 120`,
    ),
    politicaDoTenant("barbearia_isolamento", sql`${t.id}`),
  ],
).enableRLS();
