import {
  HttpException,
  NotFoundException,
  type ArgumentsHost,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "../src/identity/http/api-error.js";
import { ErrorFilter } from "../src/identity/http/error-filter.js";
import { ZodPipe } from "../src/identity/http/zod.pipe.js";

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn<(code: number) => { json: typeof json }>(() => ({
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
  new ErrorFilter().catch(exception, host);
  return {
    status: status.mock.calls[0]?.[0] as number,
    body: json.mock.calls[0]?.[0] as unknown,
  };
}

describe("ErrorFilter", () => {
  it("answers ApiError in the { code, message } format", () => {
    const { status, body } = run(
      new ApiError(409, "EMAIL_UNAVAILABLE", "E-mail indisponível."),
    );
    expect(status).toBe(409);
    expect(body).toEqual({
      code: "EMAIL_UNAVAILABLE",
      message: "E-mail indisponível.",
    });
  });

  it("includes `fields` only when present", () => {
    const { body } = run(
      new ApiError(400, "INVALID_DATA", "Dados inválidos.", {
        email: "E-mail inválido.",
      }),
    );
    expect(body).toEqual({
      code: "INVALID_DATA",
      message: "Dados inválidos.",
      fields: { email: "E-mail inválido." },
    });
  });

  it("maps Nest 404 and 429 to API codes", () => {
    expect(run(new NotFoundException("Cannot GET /x")).body).toEqual({
      code: "NOT_FOUND",
      message: "Recurso não encontrado.",
    });
    const limit = run(
      new HttpException("ThrottlerException: Too Many Requests", 429),
    );
    expect(limit.status).toBe(429);
    expect(limit.body).toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("an unexpected error becomes a generic 500, without leaking the original message", () => {
    const { status, body } = run(
      new Error("Failed query: insert ... params: ana@example.com"),
    );
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("ana@example.com");
    expect(body).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});

describe("ZodPipe", () => {
  const pipe = new ZodPipe(
    z.object({
      email: z.email(),
      name: z.string().min(2),
      role: z.enum(["owner", "barber"]),
    }),
  );

  it("returns the validated value", () => {
    expect(
      pipe.transform({ email: "a@x.com", name: "Ana", role: "owner" }),
    ).toEqual({
      email: "a@x.com",
      name: "Ana",
      role: "owner",
    });
  });

  it("answers 400 INVALID_DATA with one message per field, in Portuguese", () => {
    try {
      pipe.transform({ email: "ana@", name: "A" });
      expect.unreachable("deveria falhar");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const e = error as ApiError;
      expect(e.getStatus()).toBe(400);
      expect(e.code).toBe("INVALID_DATA");
      expect(e.fields).toEqual({
        email: "E-mail inválido.",
        name: "Valor curto demais.",
        role: "Campo obrigatório.",
      });
    }
  });
});
