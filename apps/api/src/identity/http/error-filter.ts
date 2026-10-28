import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { ApiError } from "./api-error.js";
import type { HttpRequest, HttpResponse } from "./http-types.js";

const MESSAGES: Record<number, [string, string]> = {
  400: ["INVALID_DATA", "Dados inválidos."],
  401: ["INVALID_SESSION", "Sessão inválida ou expirada. Entre novamente."],
  403: ["NO_PERMISSION", "Você não tem permissão para esta ação."],
  404: ["NOT_FOUND", "Recurso não encontrado."],
  // Only the logo upload has a body ceiling, so this is its "too large" answer.
  413: ["LOGO_TOO_LARGE", "O logo deve ter no máximo 512 KB."],
  429: [
    "TOO_MANY_REQUESTS",
    "Muitas requisições. Tente novamente em instantes.",
  ],
};

/**
 * Answers every error in the `{ code, message, fields? }` format. Logs only the
 * status, the code and the route pattern: never the exception message (Drizzle
 * stuffs it with parameters, such as e-mails), the body or the URL (which may
 * carry a token).
 */
/** The body-parser error for a body above its limit (not a Nest `HttpException`). */
function isBodyTooLarge(exception: unknown): boolean {
  return (
    exception !== null &&
    typeof exception === "object" &&
    "type" in exception &&
    exception.type === "entity.too.large"
  );
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("Errors");

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<HttpRequest>();
    const res = http.getResponse<HttpResponse>();

    let status = 500;
    let body: {
      code: string;
      message: string;
      fields?: Record<string, string>;
    } = {
      code: "INTERNAL_ERROR",
      message: "Algo deu errado. Tente novamente.",
    };

    if (exception instanceof ApiError) {
      status = exception.getStatus();
      body = {
        code: exception.code,
        message: exception.message,
        ...(exception.fields === undefined ? {} : { fields: exception.fields }),
      };
      const response = exception.getResponse();
      if (typeof response === "object") {
        body.message = (response as { message: string }).message;
      }
    } else if (isBodyTooLarge(exception)) {
      status = 413;
      const [code, message] = MESSAGES[413] ?? ["HTTP_ERROR", ""];
      body = { code, message };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const [code, message] = MESSAGES[status] ?? [
        "HTTP_ERROR",
        "Não foi possível concluir a requisição.",
      ];
      body = { code, message };
    }

    if (status >= 500) {
      const name =
        exception instanceof Error
          ? exception.constructor.name
          : typeof exception;
      this.logger.error(
        `${req.method} ${req.route?.path ?? "?"} -> ${String(status)} (${name})`,
      );
    }

    res.status(status).json(body);
  }
}
