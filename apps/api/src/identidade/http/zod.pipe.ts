import { type PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { ErroApi } from "./erro-api.js";

function mensagemDoCampo(problema: z.core.$ZodIssue): string {
  if (problema.input === undefined) {
    return "Campo obrigatório.";
  }
  switch (problema.code) {
    case "invalid_type":
      return "Valor inválido.";
    case "too_small":
      return "Valor curto demais.";
    case "too_big":
      return "Valor longo demais.";
    case "invalid_format":
      return problema.format === "email"
        ? "E-mail inválido."
        : "Formato inválido.";
    case "invalid_value":
      return "Valor não permitido.";
    default:
      return "Valor inválido.";
  }
}

/** Valida a entrada com o schema de `@barbearia/contracts` e responde `400 DADOS_INVALIDOS`. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<T>
> {
  constructor(private readonly schema: T) {}

  transform(valor: unknown): z.output<T> {
    const resultado = this.schema.safeParse(valor, { reportInput: true });
    if (resultado.success) {
      return resultado.data;
    }
    const campos: Record<string, string> = {};
    for (const problema of resultado.error.issues) {
      const chave = problema.path.join(".") || "_";
      campos[chave] ??= mensagemDoCampo(problema);
    }
    throw new ErroApi(400, "DADOS_INVALIDOS", "Dados inválidos.", campos);
  }
}
