import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { ErroApi } from "./erro-api.js";
import type { RequisicaoHttp, RespostaHttp } from "./tipos-http.js";

const MENSAGENS: Record<number, [string, string]> = {
  400: ["DADOS_INVALIDOS", "Dados inválidos."],
  401: ["SESSAO_INVALIDA", "Sessão inválida ou expirada. Entre novamente."],
  403: ["SEM_PERMISSAO", "Você não tem permissão para esta ação."],
  404: ["NAO_ENCONTRADO", "Recurso não encontrado."],
  429: [
    "MUITAS_REQUISICOES",
    "Muitas requisições. Tente novamente em instantes.",
  ],
};

/**
 * Responde todos os erros no formato `{ codigo, mensagem, campos? }`. Registra
 * só o status, o código e o padrão da rota: nunca a mensagem da exceção (o
 * Drizzle a recheia de parâmetros, como e-mails), o corpo nem a URL (que pode
 * trazer um token).
 */
@Catch()
export class FiltroDeErros implements ExceptionFilter {
  private readonly logger = new Logger("Erro");

  catch(excecao: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<RequisicaoHttp>();
    const res = http.getResponse<RespostaHttp>();

    let status = 500;
    let corpo: {
      codigo: string;
      mensagem: string;
      campos?: Record<string, string>;
    } = {
      codigo: "ERRO_INTERNO",
      mensagem: "Algo deu errado. Tente novamente.",
    };

    if (excecao instanceof ErroApi) {
      status = excecao.getStatus();
      corpo = {
        codigo: excecao.codigo,
        mensagem: excecao.message,
        ...(excecao.campos === undefined ? {} : { campos: excecao.campos }),
      };
      const resposta = excecao.getResponse();
      if (typeof resposta === "object") {
        corpo.mensagem = (resposta as { mensagem: string }).mensagem;
      }
    } else if (excecao instanceof HttpException) {
      status = excecao.getStatus();
      const [codigo, mensagem] = MENSAGENS[status] ?? [
        "ERRO_HTTP",
        "Não foi possível concluir a requisição.",
      ];
      corpo = { codigo, mensagem };
    }

    if (status >= 500) {
      const nome =
        excecao instanceof Error ? excecao.constructor.name : typeof excecao;
      this.logger.error(
        `${req.method} ${req.route?.path ?? "?"} -> ${String(status)} (${nome})`,
      );
    }

    res.status(status).json(corpo);
  }
}
