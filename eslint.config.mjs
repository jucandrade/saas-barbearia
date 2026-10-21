import js from "@eslint/js";
import expo from "eslint-config-expo/flat.js";
import next from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Restringe uma lista de configs a um conjunto de arquivos. */
const scoped = (files, configs) =>
  configs.map((config) => ({ ...config, files }));

const typedLanguageOptions = {
  parserOptions: {
    projectService: true,
    tsconfigRootDir: import.meta.dirname,
  },
};

// Princípio IV da constitution: o domínio não depende de framework, banco, rede ou relógio.
const ioModules = [
  "child_process",
  "dgram",
  "dns",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "net",
  "perf_hooks",
  "timers",
  "timers/promises",
  "tls",
];
const domainForbiddenImports = [
  "@nestjs/*",
  "next",
  "next/*",
  "react",
  "react/*",
  "react-dom",
  "react-native",
  "react-native/*",
  "expo",
  "expo/*",
  "expo-*",
  "pg",
  "ioredis",
  "bullmq",
  ...ioModules,
  ...ioModules.map((name) => `node:${name}`),
];

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.expo/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,

  // Pacotes compartilhados e API: regras estritas com informação de tipos.
  ...scoped(
    ["packages/**/*.ts", "apps/api/**/*.ts"],
    tseslint.configs.strictTypeChecked,
  ),
  {
    files: ["packages/**/*.ts", "apps/api/**/*.ts"],
    languageOptions: { ...typedLanguageOptions, globals: globals.node },
  },
  {
    // Módulos Nest são classes vazias marcadas por decorator.
    files: ["apps/api/**/*.ts"],
    rules: {
      "@typescript-eslint/no-extraneous-class": [
        "error",
        { allowWithDecorator: true },
      ],
    },
  },
  {
    files: ["packages/domain/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: domainForbiddenImports,
              message:
                "packages/domain deve ser puro: sem framework, banco, rede ou relógio.",
            },
          ],
        },
      ],
    },
  },

  // Apps web (Next.js).
  ...scoped(["apps/admin/**/*.{ts,tsx}", "apps/booking/**/*.{ts,tsx}"], next),
  ...scoped(
    ["apps/admin/**/*.{ts,tsx}", "apps/booking/**/*.{ts,tsx}"],
    tseslint.configs.recommendedTypeChecked,
  ),
  {
    files: ["apps/admin/**/*.{ts,tsx}", "apps/booking/**/*.{ts,tsx}"],
    languageOptions: typedLanguageOptions,
  },

  // App mobile (Expo).
  ...scoped(["apps/barber/**/*.{ts,tsx}"], expo),
  ...scoped(
    ["apps/barber/**/*.{ts,tsx}"],
    tseslint.configs.recommendedTypeChecked,
  ),
  {
    files: ["apps/barber/**/*.{ts,tsx}"],
    languageOptions: typedLanguageOptions,
  },

  // Arquivos JS soltos não passam pelo projeto TypeScript.
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
];
