import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    // Integration tests need the Compose Postgres: they run with `pnpm test:integration`.
    exclude: ["test/integration/**", "node_modules/**"],
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
