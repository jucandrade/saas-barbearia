import { z } from "zod";
import { Cliente, Email, Nome, Usuario } from "./comum.js";

/** `GET /auth/convites/{token}`: o que a tela mostra antes de pedir a senha. */
export const ConviteInfo = z.object({
  nome: Nome,
  barbearia: z.string().min(1),
});
export type ConviteInfo = z.infer<typeof ConviteInfo>;

/** `POST /auth/convites/aceitar`. A política de senha é aplicada pelo servidor (domínio). */
export const AceitarConviteEntrada = z.object({
  token: z.string().min(1).max(256),
  senha: z.string().min(1).max(256),
  cliente: Cliente,
});
export type AceitarConviteEntrada = z.infer<typeof AceitarConviteEntrada>;

/** Para `web` a sessão vai em cookie e `token` não existe; para `mobile` vem no corpo. */
export const SessaoSaida = z.object({
  usuario: Usuario,
  token: z.string().min(1).optional(),
});
export type SessaoSaida = z.infer<typeof SessaoSaida>;

/** Comando da equipe do produto (sem rota HTTP): provisionar uma barbearia. */
export const ProvisionarBarbeariaComando = z.object({
  nome: Nome,
  unidade: Nome,
  fuso: z.string().trim().min(1),
  donoNome: Nome,
  donoEmail: Email,
});
export type ProvisionarBarbeariaComando = z.infer<
  typeof ProvisionarBarbeariaComando
>;
