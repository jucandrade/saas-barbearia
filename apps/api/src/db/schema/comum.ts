import { sql } from "drizzle-orm";
import { customType, pgPolicy } from "drizzle-orm/pg-core";

/** Contexto do tenant da transação corrente; vazio = nenhum tenant (falha fechada). */
export const tenantDoContexto = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

/** Política de isolamento padrão: a linha só é visível e gravável no próprio tenant. */
export const politicaDoTenant = (
  nome: string,
  coluna: ReturnType<typeof sql>,
) =>
  pgPolicy(nome, {
    as: "permissive",
    for: "all",
    using: sql`${coluna} = ${tenantDoContexto}`,
    withCheck: sql`${coluna} = ${tenantDoContexto}`,
  });

/** Hash SHA-256 de token, guardado como bytes. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
