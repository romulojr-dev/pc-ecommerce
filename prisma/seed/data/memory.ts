import type { SeedPart } from "../part-schema"

// One product is one kit; capacityGb is the kit total. Prices are
// approximate PH retail, in centavos.
export const memory = [
  {
    sku: "CMK32GX5M2B6000C30",
    name: "Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30",
    brand: "Corsair",
    price: 649500,
    stock: 25,
    weightGrams: 150,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    sourceUrl:
      "https://www.corsair.com/us/en/p/memory/cmk32gx5m2b6000c30/vengeance-32gb-2x16gb-ddr5-dram-6000mt-s-cl30-memory-kit-black-cmk32gx5m2b6000c30",
    specs: {
      memoryType: "DDR5",
      capacityGb: 32,
      moduleCount: 2,
      speedMts: 6000,
      casLatency: 30,
    },
  },
  {
    sku: "KF432C16BBK2/16",
    name: "Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16",
    brand: "Kingston",
    price: 249500,
    stock: 15,
    weightGrams: 120,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    sourceUrl:
      "https://www.kingston.com/en/memory/gaming/kingston-fury-beast-ddr4-memory",
    specs: {
      memoryType: "DDR4",
      capacityGb: 16,
      moduleCount: 2,
      speedMts: 3200,
      casLatency: 16,
    },
  },
] satisfies SeedPart<"memory">[]
