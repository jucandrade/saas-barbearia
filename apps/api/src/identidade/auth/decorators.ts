import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import type { Papel } from "@barbearia/domain";
import type { RequisicaoHttp, UsuarioAutenticado } from "../http/tipos-http.js";

export const PUBLICA = "identidade:publica";
export const PAPEIS = "identidade:papeis";

/** Rota que dispensa sessão (login, convite, recuperação, health). */
export const Publica = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLICA, true);

/** Restringe a rota a um ou mais papéis; os demais recebem `403 SEM_PERMISSAO`. */
export const Papeis = (...papeis: Papel[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PAPEIS, papeis);

/** Usuário, papel e barbearia da sessão atual. */
export const UsuarioAtual = createParamDecorator(
  (
    _dado: unknown,
    contexto: ExecutionContext,
  ): UsuarioAutenticado | undefined =>
    contexto.switchToHttp().getRequest<RequisicaoHttp>().autenticado,
);
