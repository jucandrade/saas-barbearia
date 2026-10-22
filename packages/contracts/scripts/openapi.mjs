// Writes dist/openapi.json from the route registry. Run `pnpm --filter @barbearia/contracts openapi`.
import { mkdirSync, writeFileSync } from "node:fs";
import { buildOpenApi } from "../dist/index.js";

mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
const target = new URL("../dist/openapi.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
console.log(`OpenAPI written to ${target.pathname}`);
