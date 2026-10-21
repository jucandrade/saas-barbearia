import { z } from "zod";
import { Usuario } from "./comum.js";

export const UnidadeSaida = z.object({
  id: z.uuid(),
  nome: z.string().min(1),
  fusoHorario: z.string().min(1),
});
export type UnidadeSaida = z.infer<typeof UnidadeSaida>;

/** `GET /auth/eu`: quem está logado e a barbearia dele (só a própria). */
export const EuSaida = z.object({
  usuario: Usuario,
  barbearia: z.object({
    id: z.uuid(),
    nome: z.string().min(1),
    unidades: z.array(UnidadeSaida),
  }),
});
export type EuSaida = z.infer<typeof EuSaida>;
