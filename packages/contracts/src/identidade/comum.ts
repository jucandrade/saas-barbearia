import { z } from "zod";

export const Papel = z.enum(["dono", "barbeiro"]);
export type Papel = z.infer<typeof Papel>;

/** Situações visíveis pela API; `anonimizado` nunca é exposto. */
export const Situacao = z.enum(["convidado", "ativo", "desativado"]);
export type Situacao = z.infer<typeof Situacao>;

/** E-mail aparado e em minúsculas, como é guardado e comparado (FR-006). */
export const Email = z.string().trim().toLowerCase().pipe(z.email());
export type Email = z.infer<typeof Email>;

export const Nome = z.string().trim().min(1).max(120);

export const Cliente = z.enum(["web", "mobile"]);
export type Cliente = z.infer<typeof Cliente>;

/** Usuário como a API o devolve: sem hash de senha, tokens nem contadores. */
export const Usuario = z.object({
  id: z.uuid(),
  nome: Nome,
  email: Email,
  papel: Papel,
  situacao: Situacao,
  barbeariaId: z.uuid(),
});
export type Usuario = z.infer<typeof Usuario>;

/** Formato de erro de todas as rotas (contracts/api.md, Convenções). */
export const Erro = z.object({
  codigo: z.string().min(1),
  mensagem: z.string().min(1),
  campos: z.record(z.string(), z.string()).optional(),
});
export type Erro = z.infer<typeof Erro>;
