import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Load .env.local locally. On Vercel and in CI the variables already exist, so this does nothing.
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // Migrations need the direct (unpooled) connection
  datasource: {
    url: env("DATABASE_URL_UNPOOLED"),
    // Only `pnpm db:drift` and CI set it: `migrate diff --from-migrations`
    // replays the migrations in this scratch database (docs/specs/025-cart-
    // single-items, Rules › Schema and migrations stay in step)
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
