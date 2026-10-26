import type { SeedPart } from "../part-schema"

// One product is one kit; capacityGb is the kit total. Prices are sample PH
// retail prices, in centavos. Tiers: budget under ₱3,500, mid ₱3,500–₱6,499,
// high ₱6,500+.
export const memory = [
  {
    sku: "CMK32GX5M2B6000C30",
    name: "Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30",
    brand: "Corsair",
    price: 649500, // mid
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
    price: 249500, // budget
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
  {
    sku: "CMK16GX4M2B3200C16",
    name: "Corsair Vengeance LPX DDR4-3200 16 GB (2×8 GB) CL16",
    brand: "Corsair",
    price: 229500, // budget
    stock: 22,
    weightGrams: 120,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    sourceUrl:
      "https://www.corsair.com/us/en/p/memory/cmk16gx4m2b3200c16/vengeancea-lpx-16gb-2-x-8gb-ddr4-dram-3200mhz-c16-memory-kit-black-cmk16gx4m2b3200c16",
    specs: {
      memoryType: "DDR4",
      capacityGb: 16,
      moduleCount: 2,
      speedMts: 3200,
      casLatency: 16,
    },
  },
  {
    sku: "KF556C40BB-16",
    name: "Kingston FURY Beast DDR5-5600 16 GB (1×16 GB) CL40",
    brand: "Kingston",
    price: 299500, // budget
    stock: 16,
    weightGrams: 80,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    sourceUrl: "https://www.kingston.com/datasheets/KF556C40BB-16.pdf",
    specs: {
      memoryType: "DDR5",
      capacityGb: 16,
      moduleCount: 1, // single module
      speedMts: 5600,
      casLatency: 40,
    },
  },
  {
    sku: "F5-6000J3038F16GX2-FX5",
    name: "G.Skill Flare X5 DDR5-6000 32 GB (2×16 GB) CL30",
    brand: "G.Skill",
    price: 599500, // mid
    salePrice: 549500,
    stock: 11,
    weightGrams: 150,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    sourceUrl:
      "https://www.gskill.com/specification/165/396/1673491242/F5-6000J3038F16GX2-FX5-Specification",
    specs: {
      memoryType: "DDR5",
      capacityGb: 32,
      moduleCount: 2,
      speedMts: 6000,
      casLatency: 30,
    },
  },
  {
    sku: "FFRD532G6000HC30DC01",
    name: "TEAMGROUP T-Force Delta RGB ROG Certified DDR5-6000 32 GB (2×16 GB) CL30",
    brand: "TEAMGROUP",
    price: 699500, // high
    stock: 8,
    weightGrams: 160,
    warrantyMonths: 120, // lifetime; stored as 10 years
    sourceUrl:
      "https://www.teamgroupinc.com/en/product-detail/memory/desktop/delta-rgb-rog-certified-ddr5/delta-rgb-rog-certified-ddr5-FFRD532G6000HC30DC01/",
    specs: {
      memoryType: "DDR5",
      capacityGb: 32,
      moduleCount: 2,
      speedMts: 6000,
      casLatency: 30,
    },
  },
  {
    sku: "F5-6400J3239G32GX2-TZ5RK",
    name: "G.Skill Trident Z5 RGB DDR5-6400 64 GB (2×32 GB) CL32",
    brand: "G.Skill",
    price: 1499500, // high
    stock: 0, // out of stock
    weightGrams: 160,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    sourceUrl:
      "https://www.gskill.com/specification/165/374/1665644504/F5-6400J3239G32GX2-TZ5RK-Specification",
    specs: {
      memoryType: "DDR5",
      capacityGb: 64,
      moduleCount: 2,
      speedMts: 6400,
      casLatency: 32,
    },
  },
] satisfies SeedPart<"memory">[]
