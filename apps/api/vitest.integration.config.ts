import { fileURLToPath } from "node:url";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Mesmo `.env` da raiz que `db:migrate` e `dev` usam; não sobrescreve variáveis já definidas.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // Sem .env: valem os padrões de desenvolvimento.
}

export default defineConfig({
  test: {
    include: ["test/integration/**/*.spec.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ["test/integration/helpers/global-setup.ts"],
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
