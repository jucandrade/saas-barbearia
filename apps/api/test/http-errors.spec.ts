import {
  HttpException,
  NotFoundException,
  type ArgumentsHost,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ErroApi } from "../src/identidade/http/erro-api.js";
import { FiltroDeErros } from "../src/identidade/http/filtro-de-erros.js";
import { ZodPipe } from "../src/identidade/http/zod.pipe.js";

function executar(excecao: unknown) {
  const json = vi.fn();
  const status = vi.fn<(codigo: number) => { json: typeof json }>(() => ({
    json,
  }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: "POST",
        headers: {},
        route: { path: "/auth/login" },
      }),
      getResponse: () => ({ status, json }),
    }),
  } as unknown as ArgumentsHost;
  new FiltroDeErros().catch(excecao, host);
  return {
    status: status.mock.calls[0]?.[0] as number,
    corpo: json.mock.calls[0]?.[0] as unknown,
  };
}

describe("FiltroDeErros", () => {
  it("responde ErroApi no formato { codigo, mensagem }", () => {
    const { status, corpo } = executar(
      new ErroApi(409, "EMAIL_INDISPONIVEL", "E-mail indisponível."),
    );
    expect(status).toBe(409);
    expect(corpo).toEqual({
      codigo: "EMAIL_INDISPONIVEL",
      mensagem: "E-mail indisponível.",
    });
  });

  it("inclui `campos` só quando existem", () => {
    const { corpo } = executar(
      new ErroApi(400, "DADOS_INVALIDOS", "Dados inválidos.", {
        email: "E-mail inválido.",
      }),
    );
    expect(corpo).toEqual({
      codigo: "DADOS_INVALIDOS",
      mensagem: "Dados inválidos.",
      campos: { email: "E-mail inválido." },
    });
  });

  it("traduz 404 e 429 do Nest para os códigos da API", () => {
    expect(executar(new NotFoundException("Cannot GET /x")).corpo).toEqual({
      codigo: "NAO_ENCONTRADO",
      mensagem: "Recurso não encontrado.",
    });
    const limite = executar(
      new HttpException("ThrottlerException: Too Many Requests", 429),
    );
    expect(limite.status).toBe(429);
    expect(limite.corpo).toMatchObject({ codigo: "MUITAS_REQUISICOES" });
  });

  it("erro inesperado vira 500 genérico, sem vazar a mensagem original", () => {
    const { status, corpo } = executar(
      new Error("Failed query: insert ... params: ana@exemplo.com"),
    );
    expect(status).toBe(500);
    expect(JSON.stringify(corpo)).not.toContain("ana@exemplo.com");
    expect(corpo).toMatchObject({ codigo: "ERRO_INTERNO" });
  });
});

describe("ZodPipe", () => {
  const pipe = new ZodPipe(
    z.object({
      email: z.email(),
      nome: z.string().min(2),
      papel: z.enum(["dono", "barbeiro"]),
    }),
  );

  it("devolve o valor validado", () => {
    expect(
      pipe.transform({ email: "a@x.com", nome: "Ana", papel: "dono" }),
    ).toEqual({
      email: "a@x.com",
      nome: "Ana",
      papel: "dono",
    });
  });

  it("responde 400 DADOS_INVALIDOS com uma mensagem por campo, em português", () => {
    try {
      pipe.transform({ email: "ana@", nome: "A" });
      expect.unreachable("deveria falhar");
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroApi);
      const e = erro as ErroApi;
      expect(e.getStatus()).toBe(400);
      expect(e.codigo).toBe("DADOS_INVALIDOS");
      expect(e.campos).toEqual({
        email: "E-mail inválido.",
        nome: "Valor curto demais.",
        papel: "Campo obrigatório.",
      });
    }
  });
});
