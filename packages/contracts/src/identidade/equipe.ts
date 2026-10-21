import { z } from "zod";
import { Email, Nome, Papel, Usuario } from "./comum.js";

/** `GET /equipe`: usuários da própria barbearia (sem os anonimizados). */
export const EquipeSaida = z.object({ usuarios: z.array(Usuario) });
export type EquipeSaida = z.infer<typeof EquipeSaida>;

/** `POST /equipe/convites`. O papel é definido aqui e não muda depois (FR-005). */
export const ConvidarEntrada = z.object({
  nome: Nome,
  email: Email,
  papel: Papel,
});
export type ConvidarEntrada = z.infer<typeof ConvidarEntrada>;

/**
 * `conviteEnviado` é `false` quando o e-mail não pôde ser enviado: o convite foi
 * criado e o dono pode usar "Reenviar convite".
 */
export const ConvidarSaida = z.object({
  usuario: Usuario,
  conviteEnviado: z.boolean(),
});
export type ConvidarSaida = z.infer<typeof ConvidarSaida>;

/** `POST /equipe/{id}/reenviar-convite`. */
export const ReenviarSaida = z.object({ conviteEnviado: z.boolean() });
export type ReenviarSaida = z.infer<typeof ReenviarSaida>;
