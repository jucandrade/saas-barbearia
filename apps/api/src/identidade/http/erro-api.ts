import { HttpException } from "@nestjs/common";

/** Erro de negócio no formato de contracts/api.md: `{ codigo, mensagem, campos? }`. */
export class ErroApi extends HttpException {
  constructor(
    status: number,
    readonly codigo: string,
    mensagem: string,
    readonly campos?: Record<string, string>,
  ) {
    super(
      campos === undefined
        ? { codigo, mensagem }
        : { codigo, mensagem, campos },
      status,
    );
  }
}
