import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { normalizarEmail, podeDesativar } from "@barbearia/domain";
import type {
  ConvidarEntrada,
  ConvidarSaida,
  ReenviarSaida,
  Usuario,
} from "@barbearia/contracts";
import {
  codigoPg,
  mensagemPg,
  VIOLACAO_DE_UNICIDADE,
} from "../../db/erros-pg.js";
import { barbearia, tokenAcesso, usuario } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { SessaoService } from "../auth/sessao.service.js";
import { ConvitesEmissor } from "../convites/convites-emissor.js";
import { ErroApi } from "../http/erro-api.js";
import type { UsuarioAutenticado } from "../http/tipos-http.js";
import { Relogio } from "../relogio.js";

type LinhaUsuario = typeof usuario.$inferSelect;

const naoEncontrado = (): ErroApi =>
  new ErroApi(404, "NAO_ENCONTRADO", "Recurso não encontrado.");

/** A mesma resposta para e-mail usado nesta ou em outra barbearia (R13). */
const emailIndisponivel = (): ErroApi =>
  new ErroApi(409, "EMAIL_INDISPONIVEL", "E-mail indisponível.");

function paraUsuario(linha: LinhaUsuario): Usuario {
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    papel: linha.papel,
    situacao: linha.situacao === "anonimizado" ? "desativado" : linha.situacao,
    barbeariaId: linha.tenantId,
  };
}

/** Gestão da equipe pelo dono: convidar, reenviar, desativar e reativar (FR-007, FR-008). */
@Injectable()
export class EquipeService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly sessoes: SessaoService,
    private readonly auditoria: AuditoriaService,
    private readonly emissor: ConvitesEmissor,
    private readonly relogio: Relogio,
  ) {}

  async listar(atual: UsuarioAutenticado): Promise<Usuario[]> {
    const linhas = await this.tenantDb.transacao(atual.tenantId, (tx) =>
      tx
        .select()
        .from(usuario)
        .where(ne(usuario.situacao, "anonimizado"))
        .orderBy(asc(usuario.nome)),
    );
    return linhas.map(paraUsuario);
  }

  async convidar(
    atual: UsuarioAutenticado,
    entrada: ConvidarEntrada,
  ): Promise<ConvidarSaida> {
    const email = normalizarEmail(entrada.email);
    if (
      (await this.tenantDb.semTenant().buscarUsuarioPorEmail(email)) !==
      undefined
    ) {
      throw emailIndisponivel();
    }

    let criado: { id: string; token: string; nomeBarbearia: string };
    try {
      criado = await this.tenantDb.transacao(atual.tenantId, async (tx) => {
        const id = randomUUID();
        await tx.insert(usuario).values({
          id,
          tenantId: atual.tenantId,
          nome: entrada.nome,
          email,
          papel: entrada.papel,
          situacao: "convidado",
        });
        const token = await this.emissor.emitir(tx, {
          tenantId: atual.tenantId,
          usuarioId: id,
        });
        const [loja] = await tx
          .select({ nome: barbearia.nome })
          .from(barbearia);
        await this.auditoria.registrar(tx, atual.tenantId, {
          tipo: "convite_enviado",
          atorTipo: "usuario",
          atorUsuarioId: atual.usuarioId,
          alvoUsuarioId: id,
          detalhe: { papel: entrada.papel },
        });
        return { id, token, nomeBarbearia: loja?.nome ?? "" };
      });
    } catch (erro) {
      // Dois convites simultâneos para o mesmo e-mail: o índice único decide.
      if (codigoPg(erro) === VIOLACAO_DE_UNICIDADE) {
        throw emailIndisponivel();
      }
      throw erro;
    }

    const conviteEnviado = await this.emissor.enviar({
      para: email,
      nome: entrada.nome,
      barbearia: criado.nomeBarbearia,
      token: criado.token,
    });
    return {
      conviteEnviado,
      usuario: {
        id: criado.id,
        nome: entrada.nome,
        email,
        papel: entrada.papel,
        situacao: "convidado",
        barbeariaId: atual.tenantId,
      },
    };
  }

  async reenviarConvite(
    atual: UsuarioAutenticado,
    id: string,
  ): Promise<ReenviarSaida> {
    const dados = await this.tenantDb.transacao(atual.tenantId, async (tx) => {
      const [alvo] = await tx.select().from(usuario).where(eq(usuario.id, id));
      if (alvo === undefined || alvo.situacao === "anonimizado") {
        throw naoEncontrado();
      }
      if (alvo.situacao !== "convidado") {
        throw new ErroApi(
          409,
          "USUARIO_NAO_CONVIDADO",
          "Só é possível reenviar o convite de quem ainda não definiu a senha.",
        );
      }
      const token = await this.emissor.emitir(tx, {
        tenantId: atual.tenantId,
        usuarioId: alvo.id,
      });
      const [loja] = await tx.select({ nome: barbearia.nome }).from(barbearia);
      await this.auditoria.registrar(tx, atual.tenantId, {
        tipo: "convite_enviado",
        atorTipo: "usuario",
        atorUsuarioId: atual.usuarioId,
        alvoUsuarioId: alvo.id,
        detalhe: { papel: alvo.papel, origem: "reenvio" },
      });
      return { alvo, token, nomeBarbearia: loja?.nome ?? "" };
    });

    const conviteEnviado = await this.emissor.enviar({
      para: dados.alvo.email,
      nome: dados.alvo.nome,
      barbearia: dados.nomeBarbearia,
      token: dados.token,
    });
    return { conviteEnviado };
  }

  async desativar(atual: UsuarioAutenticado, id: string): Promise<void> {
    await this.tenantDb.transacao(atual.tenantId, async (tx) => {
      const [alvo] = await tx.select().from(usuario).where(eq(usuario.id, id));
      if (alvo === undefined || alvo.situacao === "anonimizado") {
        throw naoEncontrado();
      }
      if (alvo.situacao === "desativado") {
        return; // idempotente
      }

      const todos = await tx
        .select({
          id: usuario.id,
          papel: usuario.papel,
          situacao: usuario.situacao,
        })
        .from(usuario);
      const ultimoDono = new ErroApi(
        409,
        "ULTIMO_DONO",
        "A barbearia precisa de pelo menos um dono ativo.",
      );
      if (!podeDesativar(alvo, todos)) {
        throw ultimoDono;
      }

      const agora = this.relogio.agora();
      try {
        await tx
          .update(usuario)
          .set({ situacao: "desativado", desativadoEm: agora })
          .where(eq(usuario.id, alvo.id));
      } catch (erro) {
        // O gatilho do banco é a garantia final contra desativações simultâneas.
        if (mensagemPg(erro) === "ULTIMO_DONO") {
          throw ultimoDono;
        }
        throw erro;
      }

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
      await this.auditoria.registrar(tx, atual.tenantId, {
        tipo: "usuario_desativado",
        atorTipo: "usuario",
        atorUsuarioId: atual.usuarioId,
        alvoUsuarioId: alvo.id,
      });
    });
  }

  async reativar(atual: UsuarioAutenticado, id: string): Promise<void> {
    const convite = await this.tenantDb.transacao(
      atual.tenantId,
      async (tx) => {
        const [alvo] = await tx
          .select()
          .from(usuario)
          .where(eq(usuario.id, id));
        if (alvo === undefined || alvo.situacao === "anonimizado") {
          throw naoEncontrado();
        }
        if (alvo.situacao !== "desativado") {
          throw new ErroApi(
            409,
            "USUARIO_NAO_DESATIVADO",
            "Só é possível reativar um usuário desativado.",
          );
        }

        // Com senha, volta com as mesmas credenciais; sem, volta a ser convidado.
        const temSenha = alvo.senhaHash !== null;
        await tx
          .update(usuario)
          .set({
            situacao: temSenha ? "ativo" : "convidado",
            desativadoEm: null,
            tentativasFalhas: 0,
            bloqueadoAte: null,
          })
          .where(eq(usuario.id, alvo.id));

        let token: string | undefined;
        let nomeBarbearia = "";
        if (!temSenha) {
          token = await this.emissor.emitir(tx, {
            tenantId: atual.tenantId,
            usuarioId: alvo.id,
          });
          const [loja] = await tx
            .select({ nome: barbearia.nome })
            .from(barbearia);
          nomeBarbearia = loja?.nome ?? "";
        }
        await this.auditoria.registrar(tx, atual.tenantId, {
          tipo: "usuario_reativado",
          atorTipo: "usuario",
          atorUsuarioId: atual.usuarioId,
          alvoUsuarioId: alvo.id,
        });
        return token === undefined ? undefined : { token, alvo, nomeBarbearia };
      },
    );

    if (convite !== undefined) {
      await this.emissor.enviar({
        para: convite.alvo.email,
        nome: convite.alvo.nome,
        barbearia: convite.nomeBarbearia,
        token: convite.token,
      });
    }
  }
}
