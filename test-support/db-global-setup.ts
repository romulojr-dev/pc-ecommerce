import { migrateTestDatabase } from "./migrate"

// Runs once before the integration tests: checks the target database again,
// prints which one it is, and brings it up to date with the migrations. Runs
// in the main process, where process.env still has the app's own DATABASE_URL.
export default function setup() {
  migrateTestDatabase(process.env)
}
