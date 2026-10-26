import { placeholderUrl } from "@/lib/placeholders"

import type { SeedPart } from "../part-schema"

// tdpW is worst-case power at full boost (spec.md): AMD PPT = 1.35 × rated
// TDP; Intel Maximum Turbo Power. Prices are sample PH retail prices, in
// centavos. Tiers: budget under ₱9,000, mid ₱9,000–₱17,999, high ₱18,000+.
export const cpus = [
  {
    sku: "100-100001015BOX",
    name: "AMD Ryzen 5 7600",
    brand: "AMD",
    price: 1149500, // mid
    stock: 12,
    weightGrams: 450, // boxed with Wraith Stealth cooler
    warrantyMonths: 36,
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html",
    // Several images, for the product gallery (spec 006)
    images: [
      { url: placeholderUrl("cpu") },
      { url: placeholderUrl("box") },
      { url: placeholderUrl("detail") },
    ],
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
    price: 2999500, // high
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
    price: 929500, // mid
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
  {
    sku: "100-100000927BOX",
    name: "AMD Ryzen 5 5600",
    brand: "AMD",
    price: 649500, // budget
    stock: 15,
    weightGrams: 450, // boxed with Wraith Stealth cooler
    warrantyMonths: 36,
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-5-5600.html",
    specs: {
      socket: "AM4",
      generation: "zen-3",
      cores: 6,
      threads: 12,
      baseClockMhz: 3500,
      boostClockMhz: 4400,
      tdpW: 88, // PPT; rated TDP is 65 W
      hasIntegratedGraphics: false,
    },
  },
  {
    sku: "BX8071514100F",
    name: "Intel Core i3-14100F",
    brand: "Intel",
    price: 629500, // budget
    stock: 18,
    weightGrams: 450, // boxed with Laminar RM1 cooler
    warrantyMonths: 36,
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/236786/intel-core-i3-processor-14100f-12m-cache-up-to-4-70-ghz/specifications.html",
    specs: {
      socket: "LGA1700",
      generation: "raptor-lake-refresh",
      cores: 4, // 4 P-cores, no E-cores
      threads: 8,
      baseClockMhz: 3500,
      boostClockMhz: 4700,
      tdpW: 110, // Maximum Turbo Power; base power is 58 W
      hasIntegratedGraphics: false,
    },
  },
  {
    sku: "BX80768245K",
    name: "Intel Core Ultra 5 245K",
    brand: "Intel",
    price: 1549500, // mid
    salePrice: 1399500,
    stock: 9,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/241067/intel-core-ultra-5-processor-245k-24m-cache-up-to-5-20-ghz/specifications.html",
    specs: {
      socket: "LGA1851",
      generation: "arrow-lake",
      cores: 14, // 6 P-cores + 8 E-cores
      threads: 14, // no Hyper-Threading
      baseClockMhz: 4200, // P-core base
      boostClockMhz: 5200,
      tdpW: 159, // Maximum Turbo Power; base power is 125 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "BX80768265K",
    name: "Intel Core Ultra 7 265K",
    brand: "Intel",
    price: 2099500, // high
    stock: 6,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/241063/intel-core-ultra-7-processor-265k-30m-cache-up-to-5-50-ghz/specifications.html",
    specs: {
      socket: "LGA1851",
      generation: "arrow-lake",
      cores: 20, // 8 P-cores + 12 E-cores
      threads: 20, // no Hyper-Threading
      baseClockMhz: 3900, // P-core base
      boostClockMhz: 5500,
      tdpW: 250, // Maximum Turbo Power; base power is 125 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "100-100001277WOF",
    name: "AMD Ryzen 9 9950X",
    brand: "AMD",
    price: 3699500, // high
    stock: 3, // low stock
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-9-9950x.html",
    specs: {
      socket: "AM5",
      generation: "zen-5",
      cores: 16,
      threads: 32,
      baseClockMhz: 4300,
      boostClockMhz: 5700,
      tdpW: 230, // PPT; rated TDP is 170 W
      hasIntegratedGraphics: true,
    },
  },
] satisfies SeedPart<"cpu">[]
