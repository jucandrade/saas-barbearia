import { Injectable } from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  tokenVigente,
  validarSenha,
  type MotivoSenhaInvalida,
} from "@barbearia/domain";
import type {
  AceitarConviteEntrada,
  ConviteInfo,
  Usuario,
} from "@barbearia/contracts";
import { barbearia, tokenAcesso, usuario } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { SessaoService } from "../auth/sessao.service.js";
import { ErroApi } from "../http/erro-api.js";
import { Relogio } from "../relogio.js";
import { SenhaService } from "../seguranca/senha.service.js";
import { hashToken } from "../seguranca/tokens.js";

const MENSAGEM_CONVITE_INVALIDO =
  "Este convite não é mais válido. Peça um novo ao dono da barbearia.";

const MENSAGENS_SENHA: Record<MotivoSenhaInvalida, string> = {
  curta: "A senha precisa ter pelo menos 8 caracteres.",
  longa: "A senha pode ter no máximo 128 caracteres.",
  comum: "Essa senha é muito comum. Escolha outra.",
  igual_ao_email: "A senha não pode ser igual ao e-mail.",
  igual_ao_nome: "A senha não pode ser igual ao nome.",
};

export const conviteInvalido = (): ErroApi =>
  new ErroApi(410, "CONVITE_INVALIDO", MENSAGEM_CONVITE_INVALIDO);

export const senhaFraca = (motivo: MotivoSenhaInvalida): ErroApi =>
  new ErroApi(400, "SENHA_FRACA", "Senha não aceita.", {
    senha: MENSAGENS_SENHA[motivo],
  });

/** Primeiro acesso por convite (FR-009): quem define a senha é a própria pessoa. */
@Injectable()
export class ConvitesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly sessoes: SessaoService,
    private readonly senhas: SenhaService,
    private readonly auditoria: AuditoriaService,
    private readonly relogio: Relogio,
  ) {}

  /** O convite vigente do token, ou 410 (a mesma resposta para qualquer motivo). */
  private async localizar(token: string) {
    const encontrado = await this.tenantDb
      .semTenant()
      .buscarTokenAcesso(hashToken(token), "convite");
    if (
      encontrado === undefined ||
      !tokenVigente(encontrado, this.relogio.agora())
    ) {
      throw conviteInvalido();
    }
    return encontrado;
  }

  async consultar(token: string): Promise<ConviteInfo> {
    const convite = await this.localizar(token);
    return this.tenantDb.transacao(convite.tenantId, async (tx) => {
      const [convidado] = await tx
        .select({ nome: usuario.nome, situacao: usuario.situacao })
        .from(usuario)
        .where(eq(usuario.id, convite.usuarioId));
      const [loja] = await tx.select({ nome: barbearia.nome }).from(barbearia);
      if (convidado?.situacao !== "convidado" || loja === undefined) {
        throw conviteInvalido();
      }
      return { nome: convidado.nome, barbearia: loja.nome };
    });
  }

  async aceitar(
    entrada: AceitarConviteEntrada,
  ): Promise<{ usuario: Usuario; token: string }> {
    const convite = await this.localizar(entrada.token);

    const convidado = await this.tenantDb.transacao(
      convite.tenantId,
      async (tx) => {
        const [linha] = await tx
          .select()
          .from(usuario)
          .where(eq(usuario.id, convite.usuarioId));
        return linha;
      },
    );
    if (convidado?.situacao !== "convidado") {
      throw conviteInvalido();
    }

    const avaliacao = validarSenha(entrada.senha, {
      email: convidado.email,
      nome: convidado.nome,
    });
    if (!avaliacao.valida) {
      throw senhaFraca(avaliacao.motivo);
    }
    const senhaHash = await this.senhas.hash(entrada.senha);

    return this.tenantDb.transacao(convite.tenantId, async (tx) => {
      const agora = this.relogio.agora();
      // Uso único e atômico: de duas aceitações simultâneas, só uma consome o token.
      const consumido = await tx
        .update(tokenAcesso)
        .set({ usadoEm: agora })
        .where(
          and(
            eq(tokenAcesso.id, convite.id),
            isNull(tokenAcesso.usadoEm),
            isNull(tokenAcesso.invalidadoEm),
            gt(tokenAcesso.expiraEm, agora),
          ),
        )
        .returning({ id: tokenAcesso.id });
      if (consumido.length === 0) {
        throw conviteInvalido();
      }
      const ativado = await tx
        .update(usuario)
        .set({ senhaHash, situacao: "ativo" })
        .where(
          and(eq(usuario.id, convidado.id), eq(usuario.situacao, "convidado")),
        )
        .returning({ id: usuario.id });
      if (ativado.length === 0) {
        throw conviteInvalido();
      }
      const token = await this.sessoes.iniciar(tx, {
        id: convidado.id,
        tenantId: convidado.tenantId,
        papel: convidado.papel,
      });
      await this.auditoria.registrar(tx, convidado.tenantId, {
        tipo: "convite_aceito",
        atorTipo: "usuario",
        atorUsuarioId: convidado.id,
        alvoUsuarioId: convidado.id,
        detalhe: { papel: convidado.papel },
      });
      return {
        token,
        usuario: {
          id: convidado.id,
          nome: convidado.nome,
          email: convidado.email,
          papel: convidado.papel,
          situacao: "ativo",
          barbeariaId: convidado.tenantId,
        },
      };
    });
  }
}
