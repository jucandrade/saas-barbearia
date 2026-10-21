import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { barbearia } from "./barbearia.js";
import { politicaDoTenant } from "./comum.js";

export const papelUsuario = pgEnum("papel_usuario", ["dono", "barbeiro"]);
export const situacaoUsuario = pgEnum("situacao_usuario", [
  "convidado",
  "ativo",
  "desativado",
  "anonimizado",
]);

export const usuario = pgTable(
  "usuario",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => barbearia.id),
    nome: text("nome").notNull(),
    /** Normalizado (aparado, minúsculas); único em todo o sistema (FR-006, FR-023). */
    email: text("email").notNull(),
    /** Definido no convite e imutável (FR-005). */
    papel: papelUsuario("papel").notNull(),
    situacao: situacaoUsuario("situacao").notNull(),
    /** Argon2id (PHC). Nulo enquanto `convidado` e após a anonimização. */
    senhaHash: text("senha_hash"),
    tentativasFalhas: integer("tentativas_falhas").notNull().default(0),
    bloqueadoAte: timestamp("bloqueado_ate", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    desativadoEm: timestamp("desativado_em", { withTimezone: true }),
    anonimizadoEm: timestamp("anonimizado_em", { withTimezone: true }),
  },
  (t) => [
    check(
      "usuario_nome_tamanho",
      sql`char_length(${t.nome}) between 1 and 120`,
    ),
    check("usuario_email_normalizado", sql`${t.email} = lower(${t.email})`),
    check(
      "usuario_ativo_tem_senha",
      sql`${t.situacao} <> 'ativo' or ${t.senhaHash} is not null`,
    ),
    check(
      "usuario_anonimizado_sem_dados",
      sql`${t.situacao} <> 'anonimizado' or (${t.senhaHash} is null and ${t.anonimizadoEm} is not null)`,
    ),
    uniqueIndex("usuario_email_unico").on(t.email),
    index("usuario_tenant_idx").on(t.tenantId),
    politicaDoTenant("usuario_isolamento", sql`${t.tenantId}`),
  ],
).enableRLS();
