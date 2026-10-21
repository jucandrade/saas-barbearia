import { Inject, Injectable } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { POOL, type Banco, type Transacao } from "../../db/tenant-db.js";
import * as schema from "../../db/schema/index.js";
import { eventoSeguranca, tipoEventoSeguranca } from "../../db/schema/index.js";

export type TipoEvento = (typeof tipoEventoSeguranca.enumValues)[number];
export type AtorTipo = "usuario" | "plataforma" | "sistema";

export interface NovoEvento {
  tipo: TipoEvento;
  atorTipo: AtorTipo;
  atorUsuarioId?: string | null;
  alvoUsuarioId?: string | null;
  detalhe?: Record<string, unknown>;
}

/** Chaves que nunca podem aparecer no detalhe de um evento (princípio IX). */
const CHAVES_PROIBIDAS = new Set([
  "email",
  "nome",
  "senha",
  "senhahash",
  "token",
  "link",
  "ip",
]);

function verificarDetalhe(valor: unknown): void {
  if (Array.isArray(valor)) {
    valor.forEach(verificarDetalhe);
    return;
  }
  if (valor !== null && typeof valor === "object") {
    for (const [chave, filho] of Object.entries(valor)) {
      if (CHAVES_PROIBIDAS.has(chave.toLowerCase())) {
        throw new Error(
          `O detalhe de um evento de segurança não pode conter "${chave}" (dado pessoal ou segredo)`,
        );
      }
      verificarDetalhe(filho);
    }
  }
}

/** Grava a trilha de auditoria (FR-020). Só referencia pessoas pelo identificador interno. */
@Injectable()
export class AuditoriaService {
  private readonly banco: Banco;

  constructor(@Inject(POOL) pool: Pool) {
    this.banco = drizzle(pool, { schema });
  }

  /** Dentro da transação do chamador, para o evento nascer junto da operação. */
  async registrar(
    tx: Transacao,
    tenantId: string,
    evento: NovoEvento,
  ): Promise<void> {
    verificarDetalhe(evento.detalhe);
    await tx.insert(eventoSeguranca).values({
      tenantId,
      tipo: evento.tipo,
      atorTipo: evento.atorTipo,
      atorUsuarioId: evento.atorUsuarioId ?? null,
      alvoUsuarioId: evento.alvoUsuarioId ?? null,
      detalhe: evento.detalhe ?? {},
    });
  }

  /** Evento sem barbearia (falha de login de e-mail inexistente); nenhuma barbearia o enxerga. */
  async registrarSemTenant(evento: NovoEvento): Promise<void> {
    verificarDetalhe(evento.detalhe);
    await this.banco.insert(eventoSeguranca).values({
      tenantId: null,
      tipo: evento.tipo,
      atorTipo: evento.atorTipo,
      atorUsuarioId: evento.atorUsuarioId ?? null,
      alvoUsuarioId: evento.alvoUsuarioId ?? null,
      detalhe: evento.detalhe ?? {},
    });
  }
}
