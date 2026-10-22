import { fileURLToPath } from "node:url";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// The same root `.env` that `db:migrate` and `dev` use; it does not override variables already set.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // No .env: the development defaults apply.
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
