import { Controller, Get } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { EuSaida } from "@barbearia/contracts";
import { barbearia, unidade, usuario } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { ErroApi } from "../http/erro-api.js";
import type { UsuarioAutenticado } from "../http/tipos-http.js";
import { UsuarioAtual } from "./decorators.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly tenantDb: TenantDb) {}

  /** Quem está logado e a barbearia dele; a RLS garante que é só a própria. */
  @Get("eu")
  eu(@UsuarioAtual() atual: UsuarioAutenticado | undefined): Promise<EuSaida> {
    if (atual === undefined) {
      throw new ErroApi(
        401,
        "SESSAO_INVALIDA",
        "Sessão inválida ou expirada. Entre novamente.",
      );
    }
    return this.tenantDb.transacao(atual.tenantId, async (tx) => {
      const [eu] = await tx
        .select()
        .from(usuario)
        .where(eq(usuario.id, atual.usuarioId));
      const [loja] = await tx.select().from(barbearia);
      const unidades = await tx
        .select()
        .from(unidade)
        .orderBy(asc(unidade.criadaEm));
      if (eu === undefined || loja === undefined) {
        throw new ErroApi(
          401,
          "SESSAO_INVALIDA",
          "Sessão inválida ou expirada. Entre novamente.",
        );
      }
      return {
        usuario: {
          id: eu.id,
          nome: eu.nome,
          email: eu.email,
          papel: eu.papel,
          situacao: eu.situacao === "anonimizado" ? "desativado" : eu.situacao,
          barbeariaId: eu.tenantId,
        },
        barbearia: {
          id: loja.id,
          nome: loja.nome,
          unidades: unidades.map((u) => ({
            id: u.id,
            nome: u.nome,
            fusoHorario: u.fusoHorario,
          })),
        },
      };
    });
  }
}
