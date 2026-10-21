import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { calcularExpiracaoToken } from "@barbearia/domain";
import { ENV, type Env } from "../../config/config.module.js";
import { tokenAcesso } from "../../db/schema/index.js";
import type { Transacao } from "../../db/tenant-db.js";
import { EmailPort } from "../email/email.port.js";
import { linkConvite, modeloConvite } from "../email/modelos.js";
import { Relogio } from "../relogio.js";
import { gerarToken, hashToken } from "../seguranca/tokens.js";

/**
 * Emite e envia convites de primeiro acesso (R6, R7). Emitir acontece dentro da
 * transação do chamador; enviar acontece depois do commit, e uma falha de envio
 * não desfaz o convite: o dono (ou a equipe do produto) pode reenviá-lo.
 */
@Injectable()
export class ConvitesEmissor {
  private readonly logger = new Logger("Convites");

  constructor(
    private readonly relogio: Relogio,
    private readonly email: EmailPort,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Invalida o convite pendente anterior e cria outro, de 7 dias. Devolve o token em claro. */
  async emitir(
    tx: Transacao,
    alvo: { tenantId: string; usuarioId: string },
  ): Promise<string> {
    const agora = this.relogio.agora();
    await tx
      .update(tokenAcesso)
      .set({ invalidadoEm: agora })
      .where(
        and(
          eq(tokenAcesso.usuarioId, alvo.usuarioId),
          eq(tokenAcesso.finalidade, "convite"),
          isNull(tokenAcesso.usadoEm),
          isNull(tokenAcesso.invalidadoEm),
        ),
      );
    const token = gerarToken();
    await tx.insert(tokenAcesso).values({
      tenantId: alvo.tenantId,
      usuarioId: alvo.usuarioId,
      finalidade: "convite",
      tokenHash: hashToken(token),
      criadoEm: agora,
      expiraEm: calcularExpiracaoToken("convite", agora),
    });
    return token;
  }

  /** Envia o e-mail do convite; `false` se o envio falhar (o convite continua válido). */
  async enviar(dados: {
    para: string;
    nome: string;
    barbearia: string;
    token: string;
  }): Promise<boolean> {
    try {
      await this.email.enviar({
        para: dados.para,
        ...modeloConvite({
          nome: dados.nome,
          barbearia: dados.barbearia,
          link: linkConvite(this.env.adminBaseUrl, dados.token),
        }),
      });
      return true;
    } catch (erro) {
      // Só o tipo do erro: a mensagem do transporte pode trazer o destinatário.
      this.logger.warn(
        `Falha ao enviar e-mail de convite (${erro instanceof Error ? erro.constructor.name : "desconhecido"})`,
      );
      return false;
    }
  }
}
