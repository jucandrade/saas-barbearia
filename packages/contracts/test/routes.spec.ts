import { describe, expect, it } from "vitest";
import { buildOpenApi, ROUTES } from "../src/index.js";

interface Operation {
  security: unknown[];
  parameters?: { name: string }[];
  requestBody?: {
    content: Record<
      string,
      { schema: { properties?: Record<string, unknown> } }
    >;
  };
  responses: Record<string, { description: string; content?: unknown }>;
}
type Document = {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
  components: { securitySchemes: Record<string, unknown> };
};

const doc = buildOpenApi() as unknown as Document;

describe("route registry", () => {
  it("has 12 unique method+path entries", () => {
    const keys = ROUTES.map((r) => `${r.method} ${r.path}`);
    expect(keys).toHaveLength(12);
    expect(new Set(keys).size).toBe(12);
  });

  it("every route declares its path parameters in the OpenAPI document", () => {
    for (const route of ROUTES) {
      const expected = [...route.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const actual = (
        doc.paths[route.path]?.[route.method]?.parameters ?? []
      ).map((p) => p.name);
      expect(actual, route.path).toEqual(expected);
    }
  });
});

describe("buildOpenApi", () => {
  it("is an OpenAPI 3.1 document with both security schemes", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.components.securitySchemes).sort()).toEqual([
      "bearer",
      "sessionCookie",
    ]);
  });

  it("describes every route with its success status", () => {
    for (const route of ROUTES) {
      const operation = doc.paths[route.path]?.[route.method];
      expect(operation, `${route.method} ${route.path}`).toBeDefined();
      expect(operation?.responses[String(route.status)]).toBeDefined();
    }
  });

  it("public routes have no security; the others accept cookie or bearer", () => {
    for (const route of ROUTES) {
      const security = doc.paths[route.path]?.[route.method]?.security;
      expect(security?.length === 0, route.path).toBe(
        route.access === "public",
      );
    }
  });

  it("request bodies carry the JSON Schema of the input contract", () => {
    const invite = doc.paths["/team/invitations"]?.post?.requestBody;
    const properties =
      invite?.content["application/json"]?.schema.properties ?? {};
    expect(Object.keys(properties).sort()).toEqual(["email", "name", "role"]);
  });

  it("routes without a response body declare none", () => {
    expect(
      doc.paths["/auth/logout"]?.post?.responses["204"]?.content,
    ).toBeUndefined();
    expect(doc.paths["/auth/me"]?.get?.responses["200"]?.content).toBeDefined();
  });

  it("documents the error codes of each route", () => {
    const login = doc.paths["/auth/login"]?.post?.responses ?? {};
    expect(login["401"]?.description).toContain("INVALID_CREDENTIALS");
    expect(login["429"]?.description).toContain("TOO_MANY_REQUESTS");
    const team = doc.paths["/team/{id}/deactivate"]?.post?.responses ?? {};
    expect(team["409"]?.description).toContain("LAST_OWNER");
  });
});
