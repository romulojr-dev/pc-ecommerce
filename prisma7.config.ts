import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Load .env.local locally. On Vercel and in CI the variables already exist, so this does nothing.
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations need the direct (unpooled) connection
  datasource: { url: env("DATABASE_URL_UNPOOLED") },
});
