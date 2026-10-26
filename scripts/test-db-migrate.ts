import { config } from "dotenv"

import { migrateTestDatabase } from "../test-support/migrate"

// `pnpm test:db:migrate`: apply the migrations to the test database by hand.
// `pnpm test:db` does this itself, so this is only for looking at the database.
config({ path: ".env.local", quiet: true })
migrateTestDatabase(process.env)
