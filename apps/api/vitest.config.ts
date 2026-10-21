import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    // Testes de integração exigem o Postgres do Compose: rodam em `pnpm test:integration`.
    exclude: ["test/integration/**", "node_modules/**"],
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
