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
  {
    sku: "F4-3200C16S-16GVK",
    name: "G.Skill Ripjaws V DDR4-3200 16 GB (1×16 GB) CL16",
    brand: "G.Skill",
    price: 199500, // budget
    stock: 24,
    weightGrams: 60,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    boxContents: ["DDR4 memory module (1 × 16 GB)"],
    sourceUrl:
      "https://www.gskill.com/specification/165/184/1535687484/F4-3200C16S-16GVK-Specification",
    specs: {
      memoryType: "DDR4",
      capacityGb: 16,
      moduleCount: 1, // single module
      speedMts: 3200,
      casLatency: 16,
    },
  },
  {
    sku: "TED48G3200C2201",
    name: "TEAMGROUP Elite DDR4-3200 8 GB (1×8 GB) CL22",
    brand: "TEAMGROUP",
    price: 119500, // budget
    stock: 30,
    weightGrams: 40,
    warrantyMonths: 120, // lifetime; stored as 10 years
    boxContents: ["DDR4 memory module (1 × 8 GB)"],
    sourceUrl:
      "https://www.teamgroupinc.com/en/product-detail/memory/TEAMGROUP/elite-u-dimm-ddr4/elite-u-dimm-ddr4-TED48G3200C2201/",
    specs: {
      memoryType: "DDR4",
      capacityGb: 8,
      moduleCount: 1, // single module
      speedMts: 3200,
      casLatency: 22,
    },
  },
  {
    sku: "TLZGD416G3200HC16CDC01",
    name: "TEAMGROUP T-Force Vulcan Z DDR4-3200 16 GB (2×8 GB) CL16",
    brand: "TEAMGROUP",
    price: 249500, // budget
    stock: 3, // low stock
    weightGrams: 120,
    warrantyMonths: 120, // lifetime; stored as 10 years
    boxContents: ["DDR4 memory kit (2 × 8 GB modules)"],
    sourceUrl:
      "https://www.teamgroupinc.com/en/product-detail/memory/T-FORCE/vulcan-z-ddr4-gray/vulcan-z-ddr4-gray-TLZGD416G3200HC16CDC01/",
    specs: {
      memoryType: "DDR4",
      capacityGb: 16,
      moduleCount: 2,
      speedMts: 3200,
      casLatency: 16,
    },
  },
  {
    sku: "KF436C18BBK2/32",
    name: "Kingston FURY Beast DDR4-3600 32 GB (2×16 GB) CL18",
    brand: "Kingston",
    price: 449500, // mid
    stock: 17,
    weightGrams: 140,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    boxContents: ["DDR4 memory kit (2 × 16 GB modules)"],
    sourceUrl: "https://www.kingston.com/datasheets/KF436C18BBK2_32.pdf",
    specs: {
      memoryType: "DDR4",
      capacityGb: 32,
      moduleCount: 2,
      speedMts: 3600,
      casLatency: 18,
    },
  },
  {
    sku: "CMK64GX4M2E3200C16",
    name: "Corsair Vengeance LPX DDR4-3200 64 GB (2×32 GB) CL16",
    brand: "Corsair",
    price: 849500, // high
    stock: 8,
    weightGrams: 170,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    boxContents: ["DDR4 memory kit (2 × 32 GB modules)"],
    sourceUrl:
      "https://www.corsair.com/us/en/p/memory/cmk64gx4m2e3200c16/vengeancea-lpx-64gb-2-x-32gb-ddr4-dram-3200mhz-c16-memory-kit-black-cmk64gx4m2e3200c16",
    specs: {
      memoryType: "DDR4",
      capacityGb: 64,
      moduleCount: 2,
      speedMts: 3200,
      casLatency: 16,
    },
  },
  {
    sku: "TED532G5600C46DC01",
    name: "TEAMGROUP Elite DDR5-5600 32 GB (2×16 GB) CL46",
    brand: "TEAMGROUP",
    price: 499500, // mid
    stock: 18,
    weightGrams: 100,
    warrantyMonths: 120, // lifetime; stored as 10 years
    boxContents: ["DDR5 memory kit (2 × 16 GB modules)"],
    sourceUrl:
      "https://www.teamgroupinc.com/en/product-detail/memory/TEAMGROUP/elite-u-dimm-ddr5/elite-u-dimm-ddr5-TED532G5600C46DC01/",
    specs: {
      memoryType: "DDR5",
      capacityGb: 32,
      moduleCount: 2,
      speedMts: 5600,
      casLatency: 46,
    },
  },
  {
    sku: "KF564C32RSK2-32",
    name: "Kingston FURY Renegade DDR5-6400 32 GB (2×16 GB) CL32",
    brand: "Kingston",
    price: 749500, // high
    stock: 12,
    weightGrams: 160,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    boxContents: ["DDR5 memory kit (2 × 16 GB modules)"],
    sourceUrl: "https://www.kingston.com/datasheets/KF564C32RSK2-32.pdf",
    specs: {
      memoryType: "DDR5",
      capacityGb: 32,
      moduleCount: 2,
      speedMts: 6400,
      casLatency: 32,
    },
  },
  {
    sku: "KF560C36BBEK2-64",
    name: "Kingston FURY Beast DDR5-6000 64 GB (2×32 GB) CL36",
    brand: "Kingston",
    price: 1249500, // high
    stock: 7,
    weightGrams: 160,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    boxContents: ["DDR5 memory kit (2 × 32 GB modules)"],
    sourceUrl: "https://www.kingston.com/datasheets/KF560C36BBEK2-64.pdf",
    specs: {
      memoryType: "DDR5",
      capacityGb: 64,
      moduleCount: 2,
      speedMts: 6000,
      casLatency: 36,
    },
  },
  {
    sku: "F5-6000J3038F16GX2-TZ5NR",
    name: "G.Skill Trident Z5 Neo RGB DDR5-6000 32 GB (2×16 GB) CL30",
    brand: "G.Skill",
    price: 649500, // mid
    salePrice: 579500,
    stock: 14,
    weightGrams: 170,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    boxContents: ["DDR5 memory kit (2 × 16 GB modules)"],
    sourceUrl:
      "https://www.gskill.com/specification/165/390/1661410135/F5-6000J3038F16GX2-TZ5NR-Specification",
    specs: {
      memoryType: "DDR5",
      capacityGb: 32,
      moduleCount: 2,
      speedMts: 6000,
      casLatency: 30,
    },
  },
  {
    sku: "F5-6400J3239F24GX2-TZ5RK",
    name: "G.Skill Trident Z5 RGB DDR5-6400 48 GB (2×24 GB) CL32",
    brand: "G.Skill",
    price: 1099500, // high
    stock: 9,
    weightGrams: 170,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    boxContents: ["DDR5 memory kit (2 × 24 GB modules)"],
    sourceUrl:
      "https://www.gskill.com/specification/165/374/1681713260/F5-6400J3239F24GX2-TZ5RK-Specification",
    specs: {
      memoryType: "DDR5",
      capacityGb: 48,
      moduleCount: 2,
      speedMts: 6400,
      casLatency: 32,
    },
  },
  {
    sku: "CMK64GX5M4B6000C36",
    name: "Corsair Vengeance DDR5-6000 64 GB (4×16 GB) CL36",
    brand: "Corsair",
    price: 1349500, // high
    stock: 6,
    weightGrams: 300,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    boxContents: ["DDR5 memory kit (4 × 16 GB modules)"],
    sourceUrl:
      "https://www.corsair.com/us/en/p/memory/cmk64gx5m4b6000c36/vengeance-64gb-4x16gb-ddr5-dram-6000mt-s-cl36-memory-kit-black-cmk64gx5m4b6000c36",
    specs: {
      memoryType: "DDR5",
      capacityGb: 64,
      moduleCount: 4, // four modules; needs 4 slots
      speedMts: 6000,
      casLatency: 36,
    },
  },
  {
    sku: "CMK96GX5M2B6400C32",
    name: "Corsair Vengeance DDR5-6400 96 GB (2×48 GB) CL32",
    brand: "Corsair",
    price: 2199500, // high
    stock: 15, // pre-order
    preorderShipsOn: "2027-02-15",
    weightGrams: 170,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    boxContents: ["DDR5 memory kit (2 × 48 GB modules)"],
    sourceUrl:
      "https://www.corsair.com/us/en/p/memory/cmk96gx5m2b6400c32/vengeance-96gb-2x48gb-ddr5-dram-6400mt-s-cl32-memory-kit-black-cmk96gx5m2b6400c32",
    specs: {
      memoryType: "DDR5",
      capacityGb: 96,
      moduleCount: 2,
      speedMts: 6400,
      casLatency: 32,
    },
  },
  {
    sku: "F5-8000J3848H16GX2-TZ5RK",
    name: "G.Skill Trident Z5 RGB DDR5-8000 32 GB (2×16 GB) CL38",
    brand: "G.Skill",
    price: 1599500, // high
    stock: 8,
    weightGrams: 170,
    warrantyMonths: 120, // limited lifetime; stored as 10 years
    boxContents: ["DDR5 memory kit (2 × 16 GB modules)"],
    sourceUrl:
      "https://www.gskill.com/specification/165/374/1669019807/F5-8000J3848H16GX2-TZ5RK-Specification",
    specs: {
      memoryType: "DDR5",
      capacityGb: 32,
      moduleCount: 2,
      speedMts: 8000,
      casLatency: 38,
    },
  },
] satisfies SeedPart<"memory">[]
