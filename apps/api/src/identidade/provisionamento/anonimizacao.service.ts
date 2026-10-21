import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { normalizarEmail } from "@barbearia/domain";
import { tokenAcesso, usuario } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { SessaoService } from "../auth/sessao.service.js";
import { Relogio } from "../relogio.js";
import { ErroPlataforma } from "./erro-plataforma.js";

export const NOME_ANONIMIZADO = "Usuário anonimizado";
export const emailAnonimizado = (id: string): string =>
  `anonimizado-${id}@invalid`;

export interface ResultadoAnonimizacao {
  usuarioId: string;
  /** `true` se já estava anonimizado (o comando é idempotente). */
  jaAnonimizado: boolean;
}

/**
 * Anonimiza os dados pessoais de um usuário a pedido do titular (FR-024, LGPD).
 * Comando da equipe do produto, sem rota HTTP. O registro, o identificador e os
 * eventos de segurança permanecem; nome e e-mail somem de forma irreversível.
 */
@Injectable()
export class AnonimizacaoService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly sessoes: SessaoService,
    private readonly auditoria: AuditoriaService,
    private readonly relogio: Relogio,
  ) {}

  async anonimizar(entrada: { email: string }): Promise<ResultadoAnonimizacao> {
    const alvo = await this.tenantDb
      .semTenant()
      .buscarUsuarioPorEmail(normalizarEmail(entrada.email));
    if (alvo === undefined) {
      throw new ErroPlataforma(
        "Nenhum usuário com este e-mail. Se ele já foi anonimizado, use o e-mail anonimizado (anonimizado-<id>@invalid).",
      );
    }
    if (alvo.situacao === "anonimizado") {
      return { usuarioId: alvo.id, jaAnonimizado: true };
    }
    if (alvo.situacao !== "desativado") {
      throw new ErroPlataforma(
        "O usuário precisa estar desativado antes de ser anonimizado. Desative-o primeiro (o último dono ativo não pode ser desativado nem anonimizado).",
      );
    }

    await this.tenantDb.transacao(alvo.tenantId, async (tx) => {
      const agora = this.relogio.agora();
      await tx
        .update(usuario)
        .set({
          nome: NOME_ANONIMIZADO,
          email: emailAnonimizado(alvo.id),
          senhaHash: null,
          situacao: "anonimizado",
          anonimizadoEm: agora,
          tentativasFalhas: 0,
          bloqueadoAte: null,
        })
        .where(eq(usuario.id, alvo.id));
      await this.sessoes.revogarTodas(tx, alvo.id);
      await tx
        .update(tokenAcesso)
        .set({ invalidadoEm: agora })
        .where(
          and(
            eq(tokenAcesso.usuarioId, alvo.id),
            isNull(tokenAcesso.usadoEm),
            isNull(tokenAcesso.invalidadoEm),
          ),
        );
      await this.auditoria.registrar(tx, alvo.tenantId, {
        tipo: "usuario_anonimizado",
        atorTipo: "plataforma",
        alvoUsuarioId: alvo.id,
      });
    });
    return { usuarioId: alvo.id, jaAnonimizado: false };
  }
}
