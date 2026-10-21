import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import {
  calcularExpiracao,
  sessaoVigente,
  type Papel,
} from "@barbearia/domain";
import { sessao } from "../../db/schema/index.js";
import { TenantDb, type Transacao } from "../../db/tenant-db.js";
import { Relogio } from "../relogio.js";
import { gerarToken, hashToken } from "../seguranca/tokens.js";

/** A sessão renova o último uso no máximo a cada minuto (R4). */
const INTERVALO_RENOVACAO_MS = 60_000;

export interface SessaoAutenticada {
  sessaoId: string;
  usuarioId: string;
  tenantId: string;
  papel: Papel;
}

/** Sessão opaca no servidor; revogar vale na requisição seguinte (SC-004). */
@Injectable()
export class SessaoService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly relogio: Relogio,
  ) {}

  /** Cria a sessão e devolve o token, que só existe agora: no banco fica o hash. */
  async iniciar(
    tx: Transacao,
    usuario: { id: string; tenantId: string; papel: Papel },
  ): Promise<string> {
    const agora = this.relogio.agora();
    const token = gerarToken();
    await tx.insert(sessao).values({
      tenantId: usuario.tenantId,
      usuarioId: usuario.id,
      tokenHash: hashToken(token),
      criadaEm: agora,
      ultimoUsoEm: agora,
      expiraEm: calcularExpiracao(usuario.papel, agora),
    });
    return token;
  }

  /** Resolve o token em usuário, papel e tenant; `undefined` se a sessão não vale. */
  async resolver(token: string): Promise<SessaoAutenticada | undefined> {
    const encontrada = await this.tenantDb
      .semTenant()
      .buscarSessao(hashToken(token));
    if (encontrada === undefined) {
      return undefined;
    }
    const agora = this.relogio.agora();
    const vigente = sessaoVigente(
      { expiraEm: encontrada.expiraEm, revogadaEm: encontrada.revogadaEm },
      agora,
    );
    if (!vigente || encontrada.situacao !== "ativo") {
      return undefined;
    }
    if (
      agora.getTime() - encontrada.ultimoUsoEm.getTime() >=
      INTERVALO_RENOVACAO_MS
    ) {
      await this.tenantDb.transacao(encontrada.tenantId, (tx) =>
        tx
          .update(sessao)
          .set({
            ultimoUsoEm: agora,
            expiraEm: calcularExpiracao(encontrada.papel, agora),
          })
          .where(eq(sessao.id, encontrada.sessaoId)),
      );
    }
    return {
      sessaoId: encontrada.sessaoId,
      usuarioId: encontrada.usuarioId,
      tenantId: encontrada.tenantId,
      papel: encontrada.papel,
    };
  }

  async revogar(tx: Transacao, sessaoId: string): Promise<void> {
    await tx
      .update(sessao)
      .set({ revogadaEm: this.relogio.agora() })
      .where(and(eq(sessao.id, sessaoId), isNull(sessao.revogadaEm)));
  }

  /** Encerra todas as sessões abertas do usuário (desativar, trocar a senha). */
  async revogarTodas(tx: Transacao, usuarioId: string): Promise<void> {
    await tx
      .update(sessao)
      .set({ revogadaEm: this.relogio.agora() })
      .where(and(eq(sessao.usuarioId, usuarioId), isNull(sessao.revogadaEm)));
  }
}
