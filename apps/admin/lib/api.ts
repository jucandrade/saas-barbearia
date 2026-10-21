import type { z } from "zod";
import { ErrorBody } from "@barbearia/contracts";

// Next only inlines public variables read with dot access.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/** Error returned by the API in the `{ code, message, fields? }` format. */
export class ApiResponseError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

async function request(
  path: string,
  method: "GET" | "POST",
  body: unknown,
): Promise<Response> {
  const init: RequestInit = { method: method, credentials: "include" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  try {
    return await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiResponseError(
      0,
      "NO_CONNECTION",
      "Não foi possível falar com o servidor. Tente de novo.",
    );
  }
}

async function errorFromResponse(
  response: Response,
): Promise<ApiResponseError> {
  const error = ErrorBody.safeParse(
    await response.json().catch(() => undefined),
  );
  return error.success
    ? new ApiResponseError(
        response.status,
        error.data.code,
        error.data.message,
        error.data.fields,
      )
    : new ApiResponseError(
        response.status,
        "UNEXPECTED_ERROR",
        "Algo deu errado. Tente de novo.",
      );
}

interface Options<S extends z.ZodType> {
  method?: "GET" | "POST";
  body?: unknown;
  /** `@barbearia/contracts` schema that validates the success response. */
  schema: S;
}

/** Calls the API with the cookie session and validates the response against the contract. */
export async function call<S extends z.ZodType>(
  path: string,
  { method = "GET", body, schema }: Options<S>,
): Promise<z.output<S>> {
  const response = await request(path, method, body);
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  return schema.parse(await response.json());
}

/** Call whose success response has no body (`204`). */
export async function callWithoutResponse(
  path: string,
  body?: unknown,
): Promise<void> {
  const response = await request(path, "POST", body);
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
}
