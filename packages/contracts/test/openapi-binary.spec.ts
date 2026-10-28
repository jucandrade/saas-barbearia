import { describe, expect, it } from "vitest";
import { buildOpenApi, type RouteDefinition } from "../src/index.js";

interface Operation {
  requestBody?: { required: boolean; content: Record<string, unknown> };
  responses: Record<string, { content?: Record<string, unknown> }>;
}
type Document = { paths: Record<string, Record<string, Operation>> };

const routes: readonly RouteDefinition[] = [
  {
    method: "put",
    path: "/upload",
    summary: "Binary body",
    access: "owner",
    status: 200,
    body: {
      kind: "binary",
      contentTypes: ["image/png", "image/webp"],
      maxBytes: 524288,
    },
    errors: [],
  },
  {
    method: "get",
    path: "/download/{slug}",
    summary: "Binary response",
    access: "public",
    status: 200,
    responseBinary: { contentTypes: ["image/png", "image/jpeg"] },
    errors: [{ status: 404, code: "NOT_FOUND" }],
  },
];

const doc = buildOpenApi(routes) as unknown as Document;

describe("binary routes in the OpenAPI document", () => {
  it("documents a binary request body per accepted content type", () => {
    const body = doc.paths["/upload"]?.["put"]?.requestBody;
    expect(body?.required).toBe(true);
    expect(Object.keys(body?.content ?? {})).toEqual([
      "image/png",
      "image/webp",
    ]);
    expect(body?.content["image/png"]).toEqual({
      schema: { type: "string", format: "binary" },
    });
  });

  it("documents a binary success response per content type", () => {
    const success = doc.paths["/download/{slug}"]?.["get"]?.responses["200"];
    expect(Object.keys(success?.content ?? {})).toEqual([
      "image/png",
      "image/jpeg",
    ]);
  });

  it("keeps the error bodies as JSON", () => {
    const notFound = doc.paths["/download/{slug}"]?.["get"]?.responses["404"];
    expect(Object.keys(notFound?.content ?? {})).toEqual(["application/json"]);
  });
});
