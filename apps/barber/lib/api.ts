import type { z } from "zod";
import { ErrorBody } from "@barbearia/contracts";

// On the Android emulator the computer's server is `10.0.2.2`; on a device, the machine's IP.
// Expo only inlines public variables read with dot access.
const BASE =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ??
  "http://localhost:3000";

/** Error returned by the API in the `{ code, message, fields? }` format. */
export class ApiResponseError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

async function request(
  path: string,
  method: "GET" | "POST",
  body: unknown,
  token: string | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  const init: RequestInit = { method: method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  if (token !== undefined) {
    headers["Authorization"] = `Bearer ${token}`;
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
    ? new ApiResponseError(response.status, error.data.code, error.data.message)
    : new ApiResponseError(
        response.status,
        "UNEXPECTED_ERROR",
        "Algo deu errado. Tente de novo.",
      );
}

/** Calls the API with the session token (`Bearer`) and validates the response against the contract. */
export async function call<S extends z.ZodType>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    token?: string;
    schema: S;
  },
): Promise<z.output<S>> {
  const response = await request(
    path,
    options.method ?? "GET",
    options.body,
    options.token,
  );
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  return options.schema.parse(await response.json());
}

/** Call whose success response has no body (`204`). */
export async function callWithoutResponse(
  path: string,
  token: string,
): Promise<void> {
  const response = await request(path, "POST", undefined, token);
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
}
