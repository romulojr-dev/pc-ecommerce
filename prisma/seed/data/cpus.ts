import { placeholderUrl } from "@/lib/placeholders"

import type { SeedPart } from "../part-schema"

// tdpW is worst-case power at full boost (spec.md): AMD PPT = 1.35 × rated
// TDP; Intel Maximum Turbo Power. Prices are sample PH retail prices, in
// centavos. Tiers: budget under ₱9,000, mid ₱9,000–₱17,999, high ₱18,000+.
export const cpus = [
  {
    sku: "100-100001015BOX",
    name: "AMD Ryzen 5 7600",
    featured: true,
    brand: "AMD",
    price: 1149500, // mid
    stock: 12,
    weightGrams: 450, // boxed with Wraith Stealth cooler
    warrantyMonths: 36,
    boxContents: [
      "Processor",
      "AMD Wraith Stealth cooler",
      "Case badge",
      "Quick installation guide",
    ],
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
    boxContents: ["Processor", "Case badge", "Quick installation guide"],
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
    boxContents: ["Processor", "Intel Laminar RM1 cooler", "Case badge"],
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
    boxContents: [
      "Processor",
      "AMD Wraith Stealth cooler",
      "Case badge",
      "Quick installation guide",
    ],
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
    boxContents: ["Processor", "Intel Laminar RM1 cooler", "Case badge"],
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
    boxContents: ["Processor", "Case badge"],
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
    boxContents: ["Processor", "Case badge"],
    preorderShipsOn: "2027-02-01", // pre-order, for "Pre-order" states
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
    boxContents: ["Processor", "Case badge", "Quick installation guide"],
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
  {
    sku: "100-100000457BOX",
    name: "AMD Ryzen 5 5500",
    brand: "AMD",
    price: 499500, // budget
    stock: 4, // low stock
    weightGrams: 450, // boxed with Wraith Stealth cooler
    warrantyMonths: 36,
    boxContents: [
      "Processor",
      "AMD Wraith Stealth cooler",
      "Case badge",
      "Quick installation guide",
    ],
    sourceUrl:
      "https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5500.html",
    specs: {
      socket: "AM4",
      generation: "zen-3",
      cores: 6,
      threads: 12,
      baseClockMhz: 3600,
      boostClockMhz: 4200,
      tdpW: 88, // PPT; rated TDP is 65 W
      hasIntegratedGraphics: false,
    },
  },
  {
    sku: "100-100000926WOF",
    name: "AMD Ryzen 7 5700X",
    brand: "AMD",
    price: 849500, // budget
    stock: 16,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge", "Quick installation guide"],
    sourceUrl:
      "https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html",
    specs: {
      socket: "AM4",
      generation: "zen-3",
      cores: 8,
      threads: 16,
      baseClockMhz: 3400,
      boostClockMhz: 4600,
      tdpW: 88, // PPT; rated TDP is 65 W
      hasIntegratedGraphics: false,
    },
  },
  {
    sku: "100-100000651POF",
    name: "AMD Ryzen 7 5800X3D",
    brand: "AMD",
    price: 1649500, // mid
    stock: 0, // out of stock
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge", "Quick installation guide"],
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x3d.html",
    specs: {
      socket: "AM4",
      generation: "zen-3",
      cores: 8,
      threads: 16,
      baseClockMhz: 3400,
      boostClockMhz: 4500,
      tdpW: 142, // PPT; rated TDP is 105 W
      hasIntegratedGraphics: false,
    },
  },
  {
    sku: "100-100000593WOF",
    name: "AMD Ryzen 5 7600X",
    brand: "AMD",
    price: 1249500, // mid
    salePrice: 1099500,
    stock: 14,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge", "Quick installation guide"],
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600x.html",
    specs: {
      socket: "AM5",
      generation: "zen-4",
      cores: 6,
      threads: 12,
      baseClockMhz: 4700,
      boostClockMhz: 5300,
      tdpW: 142, // PPT; rated TDP is 105 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "100-100000592WOZ",
    name: "AMD Ryzen 7 7700",
    brand: "AMD",
    price: 1399500, // mid
    stock: 11,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge", "Quick installation guide"],
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-7-7700.html",
    specs: {
      socket: "AM5",
      generation: "zen-4",
      cores: 8,
      threads: 16,
      baseClockMhz: 3800,
      boostClockMhz: 5300,
      tdpW: 88, // PPT; rated TDP is 65 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "100-100000910WOF",
    name: "AMD Ryzen 7 7800X3D",
    brand: "AMD",
    price: 2299500, // high
    stock: 8,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge", "Quick installation guide"],
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-7-7800x3d.html",
    specs: {
      socket: "AM5",
      generation: "zen-4",
      cores: 8,
      threads: 16,
      baseClockMhz: 4200,
      boostClockMhz: 5000,
      tdpW: 162, // PPT; rated TDP is 120 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "100-100001405WOF",
    name: "AMD Ryzen 5 9600X",
    brand: "AMD",
    price: 1349500, // mid
    stock: 22,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge", "Quick installation guide"],
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-5-9600x.html",
    specs: {
      socket: "AM5",
      generation: "zen-5",
      cores: 6,
      threads: 12,
      baseClockMhz: 3900,
      boostClockMhz: 5400,
      tdpW: 88, // PPT; rated TDP is 65 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "100-100001404WOF",
    name: "AMD Ryzen 7 9700X",
    brand: "AMD",
    price: 1749500, // mid
    stock: 17,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge", "Quick installation guide"],
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-7-9700x.html",
    specs: {
      socket: "AM5",
      generation: "zen-5",
      cores: 8,
      threads: 16,
      baseClockMhz: 3800,
      boostClockMhz: 5500,
      tdpW: 88, // PPT; rated TDP is 65 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "100-100000662WOF",
    name: "AMD Ryzen 9 9900X",
    brand: "AMD",
    price: 2199500, // high
    stock: 10, // pre-order
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge", "Quick installation guide"],
    preorderShipsOn: "2027-03-10",
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-9-9900x.html",
    specs: {
      socket: "AM5",
      generation: "zen-5",
      cores: 12,
      threads: 24,
      baseClockMhz: 4400,
      boostClockMhz: 5600,
      tdpW: 162, // PPT; rated TDP is 120 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "100-100000719WOF",
    name: "AMD Ryzen 9 9950X3D",
    brand: "AMD",
    price: 4299500, // high
    stock: 6,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge", "Quick installation guide"],
    sourceUrl:
      "https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-9-9950x3d.html",
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
  {
    sku: "BX8071512100F",
    name: "Intel Core i3-12100F",
    brand: "Intel",
    price: 449500, // budget
    stock: 30,
    weightGrams: 450, // boxed with Laminar RM1 cooler
    warrantyMonths: 36,
    boxContents: ["Processor", "Intel Laminar RM1 cooler", "Case badge"],
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/132223/intel-core-i312100f-processor-12m-cache-up-to-4-30-ghz/specifications.html",
    specs: {
      socket: "LGA1700",
      generation: "alder-lake",
      cores: 4, // 4 P-cores, no E-cores
      threads: 8,
      baseClockMhz: 3300,
      boostClockMhz: 4300,
      tdpW: 89, // Maximum Turbo Power; base power is 58 W
      hasIntegratedGraphics: false,
    },
  },
  {
    sku: "BX8071512400F",
    name: "Intel Core i5-12400F",
    brand: "Intel",
    price: 679500, // budget
    stock: 25,
    weightGrams: 450, // boxed with Laminar RM1 cooler
    warrantyMonths: 36,
    boxContents: ["Processor", "Intel Laminar RM1 cooler", "Case badge"],
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/134587/intel-core-i512400f-processor-18m-cache-up-to-4-40-ghz/specifications.html",
    specs: {
      socket: "LGA1700",
      generation: "alder-lake",
      cores: 6, // 6 P-cores, no E-cores
      threads: 12,
      baseClockMhz: 2500, // P-core base
      boostClockMhz: 4400,
      tdpW: 117, // Maximum Turbo Power; base power is 65 W
      hasIntegratedGraphics: false,
    },
  },
  {
    sku: "BX8071513400F",
    name: "Intel Core i5-13400F",
    brand: "Intel",
    price: 999500, // mid
    stock: 19,
    weightGrams: 450, // boxed with Laminar RM1 cooler
    warrantyMonths: 36,
    boxContents: ["Processor", "Intel Laminar RM1 cooler", "Case badge"],
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/230501/intel-core-i513400f-processor-20m-cache-up-to-4-60-ghz/specifications.html",
    specs: {
      socket: "LGA1700",
      generation: "raptor-lake",
      cores: 10, // 6 P-cores + 4 E-cores
      threads: 16,
      baseClockMhz: 2500, // P-core base
      boostClockMhz: 4600,
      tdpW: 148, // Maximum Turbo Power; base power is 65 W
      hasIntegratedGraphics: false,
    },
  },
  {
    sku: "BX8071513600K",
    name: "Intel Core i5-13600K",
    brand: "Intel",
    price: 1399500, // mid
    stock: 13,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge"],
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/230493/intel-core-i513600k-processor-24m-cache-up-to-5-10-ghz/specifications.html",
    specs: {
      socket: "LGA1700",
      generation: "raptor-lake",
      cores: 14, // 6 P-cores + 8 E-cores
      threads: 20,
      baseClockMhz: 3500, // P-core base
      boostClockMhz: 5100,
      tdpW: 181, // Maximum Turbo Power; base power is 125 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "BX8071514700K",
    name: "Intel Core i7-14700K",
    brand: "Intel",
    price: 2149500, // high
    stock: 9,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge"],
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/236783/intel-core-i7-processor-14700k-33m-cache-up-to-5-60-ghz/specifications.html",
    specs: {
      socket: "LGA1700",
      generation: "raptor-lake-refresh",
      cores: 20, // 8 P-cores + 12 E-cores
      threads: 28,
      baseClockMhz: 3400, // P-core base
      boostClockMhz: 5600,
      tdpW: 253, // Maximum Turbo Power; base power is 125 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "BX8071514900K",
    name: "Intel Core i9-14900K",
    brand: "Intel",
    price: 3199500, // high
    stock: 3, // low stock
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge"],
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/236773/intel-core-i9-processor-14900k-36m-cache-up-to-6-00-ghz/specifications.html",
    specs: {
      socket: "LGA1700",
      generation: "raptor-lake-refresh",
      cores: 24, // 8 P-cores + 16 E-cores
      threads: 32,
      baseClockMhz: 3200, // P-core base
      boostClockMhz: 6000,
      tdpW: 253, // Maximum Turbo Power; base power is 125 W
      hasIntegratedGraphics: true,
    },
  },
  {
    sku: "BX80768245KF",
    name: "Intel Core Ultra 5 245KF",
    brand: "Intel",
    price: 1449500, // mid
    stock: 12,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge"],
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/241066/intel-core-ultra-5-processor-245kf-24m-cache-up-to-5-20-ghz/specifications.html",
    specs: {
      socket: "LGA1851",
      generation: "arrow-lake",
      cores: 14, // 6 P-cores + 8 E-cores
      threads: 14, // no Hyper-Threading
      baseClockMhz: 4200, // P-core base
      boostClockMhz: 5200,
      tdpW: 159, // Maximum Turbo Power; base power is 125 W
      hasIntegratedGraphics: false,
    },
  },
  {
    sku: "BX80768285K",
    name: "Intel Core Ultra 9 285K",
    brand: "Intel",
    price: 2899500, // high
    stock: 7,
    weightGrams: 200, // no cooler in the box
    warrantyMonths: 36,
    boxContents: ["Processor", "Case badge"],
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/241060/intel-core-ultra-9-processor-285k-36m-cache-up-to-5-70-ghz/specifications.html",
    specs: {
      socket: "LGA1851",
      generation: "arrow-lake",
      cores: 24, // 8 P-cores + 16 E-cores
      threads: 24, // no Hyper-Threading
      baseClockMhz: 3700, // P-core base
      boostClockMhz: 5700,
      tdpW: 250, // Maximum Turbo Power; base power is 125 W
      hasIntegratedGraphics: true,
    },
  },
] satisfies SeedPart<"cpu">[]
