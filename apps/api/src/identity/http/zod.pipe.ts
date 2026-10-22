import { type PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { ApiError } from "./api-error.js";

function fieldMessage(problem: z.core.$ZodIssue): string {
  if (problem.input === undefined) {
    return "Campo obrigatório.";
  }
  switch (problem.code) {
    case "invalid_type":
      return "Valor inválido.";
    case "too_small":
      return "Valor curto demais.";
    case "too_big":
      return "Valor longo demais.";
    case "invalid_format":
      return problem.format === "email"
        ? "E-mail inválido."
        : "Formato inválido.";
    case "invalid_value":
      return "Valor não permitido.";
    case "custom":
      return problem.message;
    default:
      return "Valor inválido.";
  }
}

/** Validates the input with the `@barbearia/contracts` schema and answers `400 INVALID_DATA`. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<T>
> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value, { reportInput: true });
    if (result.success) {
      return result.data;
    }
    const fields: Record<string, string> = {};
    for (const problem of result.error.issues) {
      const key = problem.path.join(".") || "_";
      fields[key] ??= fieldMessage(problem);
    }
    throw new ApiError(400, "INVALID_DATA", "Dados inválidos.", fields);
  }
}
