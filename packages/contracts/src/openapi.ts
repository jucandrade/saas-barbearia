import { z } from "zod";
import { ErrorBody } from "./identity/common.js";
import { ROUTES, type RouteDefinition } from "./routes.js";

type JsonSchema = Record<string, unknown>;

function jsonSchema(schema: z.ZodType): JsonSchema {
  // Transforms (trim, lowercase) cannot be represented: describe the input shape.
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
}

function bodyOf(schema: z.ZodType): JsonSchema {
  return { content: { "application/json": { schema: jsonSchema(schema) } } };
}

/** Builds the OpenAPI 3.1 document from the route registry (constitution principle V). */
export function buildOpenApi(
  routes: readonly RouteDefinition[] = ROUTES,
): JsonSchema {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const params = [...route.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    const responses: Record<string, unknown> = {
      [String(route.status)]: {
        description: "Success",
        ...(route.response === undefined ? {} : bodyOf(route.response)),
      },
    };
    const errors = [...route.errors];
    if (route.access === "owner")
      errors.push({ status: 401, code: "INVALID_SESSION" });
    for (const error of errors) {
      const key = String(error.status);
      const previous = (responses[key] as { description?: string } | undefined)
        ?.description;
      responses[key] = {
        description:
          previous === undefined ? error.code : `${previous}, ${error.code}`,
        ...bodyOf(ErrorBody),
      };
    }
    (paths[route.path] ??= {})[route.method] = {
      summary: route.summary,
      ...(route.access === "public"
        ? { security: [] }
        : { security: [{ sessionCookie: [] }, { bearer: [] }] }),
      ...(params.length > 0 ? { parameters: params } : {}),
      ...(route.request === undefined
        ? {}
        : { requestBody: { required: true, ...bodyOf(route.request) } }),
      responses,
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Barbearia API", version: "0.0.0" },
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: "apiKey", in: "cookie", name: "session" },
        bearer: { type: "http", scheme: "bearer" },
      },
    },
  };
}
