import type { SeedPart } from "../part-schema"

// tdpW is worst-case power at full boost (spec.md): AMD PPT = 1.35 × rated
// TDP; Intel Maximum Turbo Power. Prices are approximate PH retail, in
// centavos.
export const cpus = [
  {
    sku: "100-100001015BOX",
    name: "AMD Ryzen 5 7600",
    brand: "AMD",
    price: 1149500,
    stock: 12,
    weightGrams: 450, // boxed with Wraith Stealth cooler
    warrantyMonths: 36,
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html",
    specs: {
      socket: "AM5",
      generation: "zen-4",
      cores: 6,
      threads: 12,
      baseClockMhz: 3800,
      boostClockMhz: 5100,
      tdpW: 88, // PPT; rated TDP is 65 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "100-100001084WOF",
    name: "AMD Ryzen 7 9800X3D",
    brand: "AMD",
    price: 2999500,
    stock: 4, // at or below lowStockAt, for "Low stock" states
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-7-9800x3d.html",
    specs: {
      socket: "AM5",
      generation: "zen-5",
      cores: 8,
      threads: 16,
      baseClockMhz: 4700,
      boostClockMhz: 5200,
      tdpW: 162, // PPT; rated TDP is 120 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "BX8071514400F",
    name: "Intel Core i5-14400F",
    brand: "Intel",
    price: 929500,
    stock: 20,
    weightGrams: 450, // boxed with Laminar RM1 cooler
    warrantyMonths: 36,
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/236777/intel-core-i5-processor-14400f-20m-cache-up-to-4-70-ghz/specifications.html",
    specs: {
      socket: "LGA1700",
      generation: "raptor-lake-refresh",
      cores: 10, // 6 P-cores + 4 E-cores
      threads: 16,
      baseClockMhz: 2500, // P-core base
      boostClockMhz: 4700,
      tdpW: 148, // Maximum Turbo Power; base power is 65 W
      hasIntegratedGraphics: false,
    },
  },
] satisfies SeedPart<"cpu">[]
