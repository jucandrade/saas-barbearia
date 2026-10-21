import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
  ConvidarEntrada,
  type ConvidarSaida,
  type EquipeSaida,
  type ReenviarSaida,
} from "@barbearia/contracts";
import { Papeis, UsuarioAtual } from "../auth/decorators.js";
import { ErroApi } from "../http/erro-api.js";
import { IdDeRecursoPipe } from "../http/id-de-recurso.pipe.js";
import type { UsuarioAutenticado } from "../http/tipos-http.js";
import { ZodPipe } from "../http/zod.pipe.js";
import { EquipeService } from "./equipe.service.js";

function exigir(atual: UsuarioAutenticado | undefined): UsuarioAutenticado {
  if (atual === undefined) {
    throw new ErroApi(
      401,
      "SESSAO_INVALIDA",
      "Sessão inválida ou expirada. Entre novamente.",
    );
  }
  return atual;
}

/** Gestão da equipe: só o dono. Ids de outra barbearia respondem 404, como um id inexistente. */
@Papeis("dono")
@Controller("equipe")
export class EquipeController {
  constructor(private readonly equipe: EquipeService) {}

  @Get()
  async listar(
    @UsuarioAtual() atual: UsuarioAutenticado | undefined,
  ): Promise<EquipeSaida> {
    return { usuarios: await this.equipe.listar(exigir(atual)) };
  }

  @Post("convites")
  convidar(
    @UsuarioAtual() atual: UsuarioAutenticado | undefined,
    @Body(new ZodPipe(ConvidarEntrada)) entrada: ConvidarEntrada,
  ): Promise<ConvidarSaida> {
    return this.equipe.convidar(exigir(atual), entrada);
  }

  @Post(":id/reenviar-convite")
  @HttpCode(200)
  reenviarConvite(
    @UsuarioAtual() atual: UsuarioAutenticado | undefined,
    @Param("id", new IdDeRecursoPipe()) id: string,
  ): Promise<ReenviarSaida> {
    return this.equipe.reenviarConvite(exigir(atual), id);
  }

  @Post(":id/desativar")
  @HttpCode(204)
  desativar(
    @UsuarioAtual() atual: UsuarioAutenticado | undefined,
    @Param("id", new IdDeRecursoPipe()) id: string,
  ): Promise<void> {
    return this.equipe.desativar(exigir(atual), id);
  }

  @Post(":id/reativar")
  @HttpCode(204)
  reativar(
    @UsuarioAtual() atual: UsuarioAutenticado | undefined,
    @Param("id", new IdDeRecursoPipe()) id: string,
  ): Promise<void> {
    return this.equipe.reativar(exigir(atual), id);
  }
}
