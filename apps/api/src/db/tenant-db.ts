import { Inject, Injectable } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { Papel, SituacaoUsuario } from "@barbearia/domain";
import * as schema from "./schema/index.js";

export const POOL = Symbol("POOL");

export type Banco = NodePgDatabase<typeof schema>;
export type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UsuarioParaLogin {
  id: string;
  tenantId: string;
  papel: Papel;
  situacao: SituacaoUsuario;
  senhaHash: string | null;
  tentativasFalhas: number;
  bloqueadoAte: Date | null;
}

export interface SessaoEncontrada {
  sessaoId: string;
  tenantId: string;
  usuarioId: string;
  expiraEm: Date;
  ultimoUsoEm: Date;
  revogadaEm: Date | null;
  papel: Papel;
  situacao: SituacaoUsuario;
}

export interface TokenAcessoEncontrado {
  id: string;
  tenantId: string;
  usuarioId: string;
  expiraEm: Date;
  usadoEm: Date | null;
  invalidadoEm: Date | null;
}

/**
 * As três consultas que precisam rodar antes de conhecer o tenant (login,
 * sessão, convite e recuperação). Chamam as funções `auth_*` do banco e não
 * oferecem nenhum outro acesso fora da RLS (R3).
 */
export class BuscasDeAutenticacao {
  constructor(private readonly pool: Pool) {}

  async buscarUsuarioPorEmail(
    email: string,
  ): Promise<UsuarioParaLogin | undefined> {
    const { rows } = await this.pool.query<{
      id: string;
      tenant_id: string;
      papel: Papel;
      situacao: SituacaoUsuario;
      senha_hash: string | null;
      tentativas_falhas: number;
      bloqueado_ate: Date | null;
    }>("select * from auth_buscar_usuario_por_email($1)", [email]);
    const r = rows[0];
    return r === undefined
      ? undefined
      : {
          id: r.id,
          tenantId: r.tenant_id,
          papel: r.papel,
          situacao: r.situacao,
          senhaHash: r.senha_hash,
          tentativasFalhas: r.tentativas_falhas,
          bloqueadoAte: r.bloqueado_ate,
        };
  }

  async buscarSessao(tokenHash: Buffer): Promise<SessaoEncontrada | undefined> {
    const { rows } = await this.pool.query<{
      sessao_id: string;
      tenant_id: string;
      usuario_id: string;
      expira_em: Date;
      ultimo_uso_em: Date;
      revogada_em: Date | null;
      papel: Papel;
      situacao: SituacaoUsuario;
    }>("select * from auth_buscar_sessao($1)", [tokenHash]);
    const r = rows[0];
    return r === undefined
      ? undefined
      : {
          sessaoId: r.sessao_id,
          tenantId: r.tenant_id,
          usuarioId: r.usuario_id,
          expiraEm: r.expira_em,
          ultimoUsoEm: r.ultimo_uso_em,
          revogadaEm: r.revogada_em,
          papel: r.papel,
          situacao: r.situacao,
        };
  }

  async buscarTokenAcesso(
    tokenHash: Buffer,
    finalidade: "convite" | "recuperacao",
  ): Promise<TokenAcessoEncontrado | undefined> {
    const { rows } = await this.pool.query<{
      id: string;
      tenant_id: string;
      usuario_id: string;
      expira_em: Date;
      usado_em: Date | null;
      invalidado_em: Date | null;
    }>("select * from auth_buscar_token_acesso($1, $2)", [
      tokenHash,
      finalidade,
    ]);
    const r = rows[0];
    return r === undefined
      ? undefined
      : {
          id: r.id,
          tenantId: r.tenant_id,
          usuarioId: r.usuario_id,
          expiraEm: r.expira_em,
          usadoEm: r.usado_em,
          invalidadoEm: r.invalidado_em,
        };
  }
}

/**
 * Único caminho de acesso aos dados de negócio. Toda consulta roda numa
 * transação com `app.tenant_id` definido; sem isso a RLS devolve zero linhas
 * (falha fechada, FR-017).
 */
@Injectable()
export class TenantDb {
  private readonly banco: Banco;

  constructor(@Inject(POOL) private readonly pool: Pool) {
    this.banco = drizzle(pool, { schema });
  }

  async transacao<T>(
    tenantId: string,
    fn: (tx: Transacao) => Promise<T>,
  ): Promise<T> {
    if (!UUID.test(tenantId)) {
      throw new Error("tenantId inválido: esperado um UUID");
    }
    return this.banco.transaction(async (tx) => {
      // Parâmetro, nunca concatenação; `true` limita o valor à transação.
      await tx.execute(
        sql`select set_config('app.tenant_id', ${tenantId}, true)`,
      );
      return fn(tx);
    });
  }

  semTenant(): BuscasDeAutenticacao {
    return new BuscasDeAutenticacao(this.pool);
  }
}
