import js from "@eslint/js";
import expo from "eslint-config-expo/flat.js";
import next from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Restricts a list of configs to a set of files. */
const scoped = (files, configs) =>
  configs.map((config) => ({ ...config, files }));

const typedLanguageOptions = {
  parserOptions: {
    projectService: true,
    tsconfigRootDir: import.meta.dirname,
  },
};

// Constitution principle IV: the domain depends on no framework, database, network or clock.
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

  // Shared packages and API: strict rules with type information.
  ...scoped(
    ["packages/**/*.ts", "apps/api/**/*.ts"],
    tseslint.configs.strictTypeChecked,
  ),
  {
    files: ["packages/**/*.ts", "apps/api/**/*.ts"],
    languageOptions: { ...typedLanguageOptions, globals: globals.node },
  },
  {
    // Nest modules are empty classes marked by a decorator.
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
                "packages/domain must be pure: no framework, database, network or clock.",
            },
          ],
        },
      ],
    },
  },

  // Web apps (Next.js).
  ...scoped(["apps/admin/**/*.{ts,tsx}", "apps/booking/**/*.{ts,tsx}"], next),
  ...scoped(
    ["apps/admin/**/*.{ts,tsx}", "apps/booking/**/*.{ts,tsx}"],
    tseslint.configs.recommendedTypeChecked,
  ),
  {
    files: ["apps/admin/**/*.{ts,tsx}", "apps/booking/**/*.{ts,tsx}"],
    languageOptions: typedLanguageOptions,
  },

  // Mobile app (Expo).
  ...scoped(["apps/barber/**/*.{ts,tsx}"], expo),
  ...scoped(
    ["apps/barber/**/*.{ts,tsx}"],
    tseslint.configs.recommendedTypeChecked,
  ),
  {
    files: ["apps/barber/**/*.{ts,tsx}"],
    languageOptions: typedLanguageOptions,
  },

  // Loose JS files do not go through the TypeScript project.
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
];
