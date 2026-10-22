import { expect } from "vitest";
import { ErrorBody, ROUTES, type HttpMethod } from "@barbearia/contracts";

interface ResponseLike {
  status: number;
  body: unknown;
  text: string;
}

/** The success status the route registry promises for the route. */
export function successStatus(method: HttpMethod, path: string): number {
  const route = ROUTES.find((r) => r.method === method && r.path === path);
  if (route === undefined) {
    throw new Error(`route not in the registry: ${method} ${path}`);
  }
  return route.status;
}

/** The response is an error in the `{ code, message, fields? }` format, with the status and code expected. */
export function expectError(
  response: ResponseLike,
  status: number,
  code: string,
): ErrorBody {
  expect(response.status).toBe(status);
  const body = ErrorBody.parse(response.body);
  expect(body.code).toBe(code);
  return body;
}

/** Every registry route under the prefixes was exercised by the file. */
export function expectCovers(
  prefixes: readonly string[],
  covered: ReadonlySet<string>,
): void {
  const expected = ROUTES.filter((r) =>
    prefixes.some((prefix) => r.path.startsWith(prefix)),
  ).map((r) => `${r.method} ${r.path}`);
  expect([...covered].sort()).toEqual(expect.arrayContaining(expected.sort()));
}

/** Each listed `method path` is in the registry and was exercised by the file. */
export function expectRoutesCovered(
  routes: readonly string[],
  covered: ReadonlySet<string>,
): void {
  const registry = new Set(ROUTES.map((r) => `${r.method} ${r.path}`));
  for (const route of routes) {
    expect(registry.has(route), `not in the registry: ${route}`).toBe(true);
    expect(covered.has(route), `not exercised: ${route}`).toBe(true);
  }
}
