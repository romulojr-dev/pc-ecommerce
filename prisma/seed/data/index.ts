import { cases } from "./cases"
import { cpuCoolers } from "./cpu-coolers"
import { cpus } from "./cpus"
import { gpus } from "./gpus"
import { memory } from "./memory"
import { motherboards } from "./motherboards"
import { psus } from "./psus"
import { storage } from "./storage"

// Every seed data file with its category. `file` is written out so error
// messages can name it; the seed checks that each path exists.
export const seedFiles = [
  { file: "prisma/seed/data/cpus.ts", category: "cpu", parts: cpus },
  {
    file: "prisma/seed/data/motherboards.ts",
    category: "motherboard",
    parts: motherboards,
  },
  { file: "prisma/seed/data/memory.ts", category: "memory", parts: memory },
  { file: "prisma/seed/data/storage.ts", category: "storage", parts: storage },
  { file: "prisma/seed/data/gpus.ts", category: "gpu", parts: gpus },
  { file: "prisma/seed/data/cases.ts", category: "case", parts: cases },
  { file: "prisma/seed/data/psus.ts", category: "psu", parts: psus },
  {
    file: "prisma/seed/data/cpu-coolers.ts",
    category: "cpu-cooler",
    parts: cpuCoolers,
  },
] as const
