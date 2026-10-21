import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { barbearia } from "./barbearia.js";
import { politicaDoTenant } from "./comum.js";

/** Local de atendimento; toda barbearia tem ao menos uma. */
export const unidade = pgTable(
  "unidade",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => barbearia.id),
    nome: text("nome").notNull(),
    /** Nome IANA (por exemplo, `America/Sao_Paulo`), validado na criação. */
    fusoHorario: text("fuso_horario").notNull(),
    criadaEm: timestamp("criada_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "unidade_nome_tamanho",
      sql`char_length(${t.nome}) between 1 and 120`,
    ),
    check("unidade_fuso_preenchido", sql`char_length(${t.fusoHorario}) > 0`),
    index("unidade_tenant_idx").on(t.tenantId),
    politicaDoTenant("unidade_isolamento", sql`${t.tenantId}`),
  ],
).enableRLS();
