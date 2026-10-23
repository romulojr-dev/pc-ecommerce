import { fileURLToPath } from "node:url"

import { config } from "dotenv"

// Next.js loads .env.local by itself; a plain tsx script does not. Import
// this first in prisma/seed.ts so the variables exist before @/lib/env
// validates them. Imports run in order, so "first" is enough.
config({
  path: fileURLToPath(new URL("../../.env.local", import.meta.url)),
  quiet: true,
})
