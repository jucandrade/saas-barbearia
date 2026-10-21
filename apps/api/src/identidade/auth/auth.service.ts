import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  avaliarTentativaLogin,
  normalizarEmail,
  registrarFalhaLogin,
  registrarSucessoLogin,
} from "@barbearia/domain";
import type { LoginEntrada, Usuario } from "@barbearia/contracts";
import { usuario } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { ErroApi } from "../http/erro-api.js";
import { Relogio } from "../relogio.js";
import { SenhaService } from "../seguranca/senha.service.js";
import { SessaoService } from "./sessao.service.js";

/** A mesma resposta para qualquer motivo de falha, para não revelar se a conta existe (FR-014). */
export const credenciaisInvalidas = (): ErroApi =>
  new ErroApi(
    401,
    "CREDENCIAIS_INVALIDAS",
    "E-mail ou senha incorretos, ou acesso temporariamente bloqueado.",
  );

type ResultadoLogin =
  { sucesso: false } | { sucesso: true; token: string; usuario: Usuario };

@Injectable()
export class AuthService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly sessoes: SessaoService,
    private readonly senhas: SenhaService,
    private readonly auditoria: AuditoriaService,
    private readonly relogio: Relogio,
  ) {}

  async login(
    entrada: LoginEntrada,
  ): Promise<{ usuario: Usuario; token: string }> {
    const achado = await this.tenantDb
      .semTenant()
      .buscarUsuarioPorEmail(normalizarEmail(entrada.email));

    if (achado === undefined) {
      // Gasta o tempo de uma verificação real: a resposta não denuncia e-mail inexistente.
      await this.senhas.verificarSenhaFicticia(entrada.senha);
      await this.auditoria.registrarSemTenant({
        tipo: "login_falha",
        atorTipo: "sistema",
        detalhe: { motivo: "conta_inexistente" },
      });
      throw credenciaisInvalidas();
    }

    const resultado: ResultadoLogin = await this.tenantDb.transacao(
      achado.tenantId,
      async (tx) => {
        // Trava a conta enquanto verifica: tentativas simultâneas contam uma de cada vez.
        const [conta] = await tx
          .select()
          .from(usuario)
          .where(eq(usuario.id, achado.id))
          .for("update");
        if (conta === undefined) {
          return { sucesso: false };
        }
        const agora = this.relogio.agora();
        const avaliacao = avaliarTentativaLogin(
          {
            tentativasFalhas: conta.tentativasFalhas,
            bloqueadoAte: conta.bloqueadoAte,
          },
          agora,
        );
        const registrarFalha = (motivo: string) =>
          this.auditoria.registrar(tx, conta.tenantId, {
            tipo: "login_falha",
            atorTipo: "usuario",
            atorUsuarioId: conta.id,
            alvoUsuarioId: conta.id,
            detalhe: { motivo },
          });

        if (avaliacao.bloqueado) {
          await this.senhas.verificarSenhaFicticia(entrada.senha);
          await registrarFalha("conta_bloqueada");
          return { sucesso: false };
        }

        const senhaCorreta =
          conta.senhaHash === null
            ? await this.senhas.verificarSenhaFicticia(entrada.senha)
            : await this.senhas.verificar(conta.senhaHash, entrada.senha);

        if (!senhaCorreta || conta.situacao !== "ativo") {
          const novo = registrarFalhaLogin(avaliacao.estado, agora);
          await tx
            .update(usuario)
            .set({
              tentativasFalhas: novo.tentativasFalhas,
              bloqueadoAte: novo.bloqueadoAte,
            })
            .where(eq(usuario.id, conta.id));
          await registrarFalha(
            senhaCorreta ? "conta_inativa" : "senha_incorreta",
          );
          return { sucesso: false };
        }

        const limpo = registrarSucessoLogin();
        await tx
          .update(usuario)
          .set({
            tentativasFalhas: limpo.tentativasFalhas,
            bloqueadoAte: limpo.bloqueadoAte,
          })
          .where(eq(usuario.id, conta.id));
        const token = await this.sessoes.iniciar(tx, {
          id: conta.id,
          tenantId: conta.tenantId,
          papel: conta.papel,
        });
        await this.auditoria.registrar(tx, conta.tenantId, {
          tipo: "login_sucesso",
          atorTipo: "usuario",
          atorUsuarioId: conta.id,
          alvoUsuarioId: conta.id,
          detalhe: { papel: conta.papel },
        });
        return {
          sucesso: true,
          token,
          usuario: {
            id: conta.id,
            nome: conta.nome,
            email: conta.email,
            papel: conta.papel,
            situacao: "ativo",
            barbeariaId: conta.tenantId,
          },
        };
      },
    );

    if (!resultado.sucesso) {
      throw credenciaisInvalidas();
    }
    return { usuario: resultado.usuario, token: resultado.token };
  }

  async logout(sessao: {
    tenantId: string;
    sessaoId: string;
    usuarioId: string;
  }): Promise<void> {
    await this.tenantDb.transacao(sessao.tenantId, async (tx) => {
      await this.sessoes.revogar(tx, sessao.sessaoId);
      await this.auditoria.registrar(tx, sessao.tenantId, {
        tipo: "logout",
        atorTipo: "usuario",
        atorUsuarioId: sessao.usuarioId,
        alvoUsuarioId: sessao.usuarioId,
      });
    });
  }
}
