import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { normalizarEmail } from "@barbearia/domain";
import type { ProvisionarBarbeariaComando } from "@barbearia/contracts";
import { codigoPg, VIOLACAO_DE_UNICIDADE } from "../../db/erros-pg.js";
import { barbearia, unidade, usuario } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { ConvitesEmissor } from "../convites/convites-emissor.js";
import { Relogio } from "../relogio.js";
import { EMAIL_INDISPONIVEL, ErroPlataforma } from "./erro-plataforma.js";

const FUSOS_VALIDOS = new Set<string>([
  ...Intl.supportedValuesOf("timeZone"),
  "UTC",
]);

export interface ResultadoProvisionamento {
  barbeariaId: string;
  /** `false` se o e-mail do convite não pôde ser enviado (a barbearia foi criada mesmo assim). */
  conviteEnviado: boolean;
}

/**
 * Provisiona uma barbearia: barbearia, unidade inicial e dono convidado numa só
 * transação (FR-001, FR-002). É comando da equipe do produto, sem rota HTTP (FR-022).
 * Define `app.tenant_id` com o UUID gerado antes de qualquer escrita, então não
 * depende de ignorar a RLS (R2).
 */
@Injectable()
export class ProvisionamentoService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly emissor: ConvitesEmissor,
    private readonly auditoria: AuditoriaService,
    private readonly relogio: Relogio,
  ) {}

  async provisionar(
    dados: ProvisionarBarbeariaComando,
  ): Promise<ResultadoProvisionamento> {
    if (!FUSOS_VALIDOS.has(dados.fuso)) {
      throw new ErroPlataforma(`Fuso horário inexistente: ${dados.fuso}.`);
    }
    const email = normalizarEmail(dados.donoEmail);
    if (
      (await this.tenantDb.semTenant().buscarUsuarioPorEmail(email)) !==
      undefined
    ) {
      throw new ErroPlataforma(EMAIL_INDISPONIVEL);
    }

    const barbeariaId = randomUUID();
    const unidadeId = randomUUID();
    const usuarioId = randomUUID();

    let token: string;
    try {
      token = await this.tenantDb.transacao(barbeariaId, async (tx) => {
        await tx.insert(barbearia).values({
          id: barbeariaId,
          nome: dados.nome,
          criadaEm: this.relogio.agora(),
        });
        await tx.insert(unidade).values({
          id: unidadeId,
          tenantId: barbeariaId,
          nome: dados.unidade,
          fusoHorario: dados.fuso,
        });
        await tx.insert(usuario).values({
          id: usuarioId,
          tenantId: barbeariaId,
          nome: dados.donoNome,
          email,
          papel: "dono",
          situacao: "convidado",
        });
        const emitido = await this.emissor.emitir(tx, {
          tenantId: barbeariaId,
          usuarioId,
        });
        await this.auditoria.registrar(tx, barbeariaId, {
          tipo: "barbearia_provisionada",
          atorTipo: "plataforma",
          alvoUsuarioId: usuarioId,
          detalhe: { papel: "dono" },
        });
        await this.auditoria.registrar(tx, barbeariaId, {
          tipo: "convite_enviado",
          atorTipo: "plataforma",
          alvoUsuarioId: usuarioId,
          detalhe: { papel: "dono", origem: "provisionamento" },
        });
        return emitido;
      });
    } catch (erro) {
      // Dois provisionamentos simultâneos com o mesmo e-mail: o índice único decide.
      if (codigoPg(erro) === VIOLACAO_DE_UNICIDADE) {
        throw new ErroPlataforma(EMAIL_INDISPONIVEL);
      }
      throw erro;
    }

    const conviteEnviado = await this.emissor.enviar({
      para: email,
      nome: dados.donoNome,
      barbearia: dados.nome,
      token,
    });
    return { barbeariaId, conviteEnviado };
  }
}
