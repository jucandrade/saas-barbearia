import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { normalizarEmail } from "@barbearia/domain";
import { codigoPg, VIOLACAO_DE_UNICIDADE } from "../../db/erros-pg.js";
import { barbearia, usuario } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { ConvitesEmissor } from "../convites/convites-emissor.js";
import { EMAIL_INDISPONIVEL, ErroPlataforma } from "./erro-plataforma.js";

/**
 * Reenvia o convite do primeiro dono, que ainda não pode entrar e por isso não
 * tem como pedir um novo (FR-009). Comando da equipe do produto, sem rota HTTP.
 */
@Injectable()
export class ReenvioConviteDonoService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly emissor: ConvitesEmissor,
    private readonly auditoria: AuditoriaService,
  ) {}

  async reenviar(entrada: {
    email: string;
    novoEmail?: string;
  }): Promise<{ conviteEnviado: boolean }> {
    const atual = normalizarEmail(entrada.email);
    const alvo = await this.tenantDb.semTenant().buscarUsuarioPorEmail(atual);
    if (alvo?.papel !== "dono" || alvo.situacao !== "convidado") {
      throw new ErroPlataforma(
        "Não há dono com convite pendente para este e-mail.",
      );
    }

    const destino =
      entrada.novoEmail === undefined
        ? atual
        : normalizarEmail(entrada.novoEmail);
    if (
      destino !== atual &&
      (await this.tenantDb.semTenant().buscarUsuarioPorEmail(destino)) !==
        undefined
    ) {
      throw new ErroPlataforma(EMAIL_INDISPONIVEL);
    }

    let resultado: { token: string; nome: string; nomeBarbearia: string };
    try {
      resultado = await this.tenantDb.transacao(alvo.tenantId, async (tx) => {
        if (destino !== atual) {
          await tx
            .update(usuario)
            .set({ email: destino })
            .where(eq(usuario.id, alvo.id));
        }
        const [dono] = await tx
          .select({ nome: usuario.nome })
          .from(usuario)
          .where(eq(usuario.id, alvo.id));
        const [loja] = await tx
          .select({ nome: barbearia.nome })
          .from(barbearia);
        const token = await this.emissor.emitir(tx, {
          tenantId: alvo.tenantId,
          usuarioId: alvo.id,
        });
        await this.auditoria.registrar(tx, alvo.tenantId, {
          tipo: "convite_enviado",
          atorTipo: "plataforma",
          alvoUsuarioId: alvo.id,
          detalhe: { papel: "dono", origem: "reenvio" },
        });
        return {
          token,
          nome: dono?.nome ?? "",
          nomeBarbearia: loja?.nome ?? "",
        };
      });
    } catch (erro) {
      if (codigoPg(erro) === VIOLACAO_DE_UNICIDADE) {
        throw new ErroPlataforma(EMAIL_INDISPONIVEL);
      }
      throw erro;
    }

    const conviteEnviado = await this.emissor.enviar({
      para: destino,
      nome: resultado.nome,
      barbearia: resultado.nomeBarbearia,
      token: resultado.token,
    });
    return { conviteEnviado };
  }
}
