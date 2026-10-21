import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
