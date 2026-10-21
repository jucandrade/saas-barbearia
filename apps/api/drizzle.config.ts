import { defineConfig } from "drizzle-kit";
import { lerEnv } from "./src/config/env.js";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: lerEnv().databaseAdminUrl },
});
