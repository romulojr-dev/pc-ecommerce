import { placeholderUrl } from "@/lib/placeholders"

import type { SeedPart } from "../part-schema"

// Clearances are rounded down from the manufacturer's figure. Radiator sizes
// are the union across mounting positions. Prices are sample PH retail prices,
// in centavos. Tiers: budget under ₱4,000, mid ₱4,000–₱6,499, high ₱6,500+.
export const cases = [
  {
    sku: "LAN216X",
    name: "Lian Li LANCOOL 216 Black",
    brand: "Lian Li",
    price: 579500, // mid
    stock: 7,
    weightGrams: 9000,
    warrantyMonths: 12,
    sourceUrl: "https://lian-li.com/product/lancool-216/",
    // Several images, for the product gallery (spec 006)
    images: [
      { url: placeholderUrl("case") },
      { url: placeholderUrl("detail") },
    ],
    specs: {
      // E-ATX only up to 280 mm wide
      motherboardFormFactors: ["E_ATX", "ATX", "MICRO_ATX", "MINI_ITX"],
      maxGpuLengthMm: 392,
      maxCoolerHeightMm: 180, // 180.5 mm
      radiatorSizesMm: [240, 280, 360], // front and top 240–360, bottom 240
      psuFormFactors: ["ATX"],
    },
  },
  {
    sku: "MCB-Q300L-KANN-S00",
    name: "Cooler Master MasterBox Q300L",
    brand: "Cooler Master",
    price: 299500, // budget
    stock: 11,
    weightGrams: 5000,
    warrantyMonths: 24,
    sourceUrl:
      "https://www.coolermaster.com/catalog/cases/mini-towers/masterbox-q300l/",
    specs: {
      motherboardFormFactors: ["MICRO_ATX", "MINI_ITX"],
      maxGpuLengthMm: 360,
      maxCoolerHeightMm: 157, // black edition
      radiatorSizesMm: [120, 140, 240], // front 120/140/240, rear 120
      psuFormFactors: ["ATX"],
    },
  },
  {
    sku: "FD-C-RID1N-11",
    name: "Fractal Design Ridge Black",
    brand: "Fractal Design",
    price: 699500, // high
    stock: 2,
    weightGrams: 5000,
    warrantyMonths: 24,
    sourceUrl:
      "https://www.fractal-design.com/products/cases/ridge/ridge/black/",
    specs: {
      motherboardFormFactors: ["MINI_ITX"],
      maxGpuLengthMm: 335, // without a 2.5" SSD installed (325 with one)
      maxCoolerHeightMm: 70,
      // Side mount: 120 with a GPU up to 175 mm, 280 with no GPU
      radiatorSizesMm: [120, 280],
      psuFormFactors: ["SFX", "SFX_L"],
    },
  },
  {
    sku: "AIR 100 ARGB BLACK",
    name: "Montech AIR 100 ARGB Black",
    brand: "Montech",
    price: 299500, // budget
    stock: 16,
    weightGrams: 6500,
    warrantyMonths: 12,
    sourceUrl: "https://www.montechpc.com/air-100-argb",
    specs: {
      motherboardFormFactors: ["MICRO_ATX", "MINI_ITX"],
      maxGpuLengthMm: 330,
      maxCoolerHeightMm: 161,
      // Front 120/140/240/280, top 120/140/240, rear 120
      radiatorSizesMm: [120, 140, 240, 280],
      psuFormFactors: ["ATX"],
    },
  },
  {
    sku: "CC-9011200-WW",
    name: "Corsair 4000D AIRFLOW Black",
    brand: "Corsair",
    price: 549500, // mid
    stock: 10,
    weightGrams: 9000,
    warrantyMonths: 24,
    sourceUrl:
      "https://www.corsair.com/us/en/p/pc-cases/cc-9011200-ww/4000d-airflow-tempered-glass-mid-tower-atx-case-black-cc-9011200-ww",
    specs: {
      motherboardFormFactors: ["ATX", "MICRO_ATX", "MINI_ITX"],
      maxGpuLengthMm: 360, // 340 with a front radiator
      maxCoolerHeightMm: 170,
      // Front 240/280/360; top 240 (280 with low-profile RAM)
      radiatorSizesMm: [120, 140, 240, 280, 360],
      psuFormFactors: ["ATX"],
    },
  },
  {
    sku: "CC-H52FB-01",
    name: "NZXT H5 Flow (2024) Black",
    brand: "NZXT",
    price: 599500, // mid
    stock: 8,
    weightGrams: 8500,
    warrantyMonths: 24,
    sourceUrl:
      "https://support.nzxt.com/hc/en-us/articles/40225168535451-H5-Flow-2024-Specs",
    specs: {
      motherboardFormFactors: ["ATX", "MICRO_ATX", "MINI_ITX"],
      maxGpuLengthMm: 410, // the manual says 425; the lower figure is used
      maxCoolerHeightMm: 170, // NZXT's FAQ says 175; the lower figure is used
      // Front up to 360 (280 on 140 mm fans); top 240 (280 with low-profile RAM)
      radiatorSizesMm: [120, 140, 240, 280, 360],
      psuFormFactors: ["ATX"],
    },
  },
  {
    sku: "O11DEX",
    name: "Lian Li O11 Dynamic EVO Black",
    brand: "Lian Li",
    price: 949500, // high
    stock: 5, // low stock
    weightGrams: 13000,
    warrantyMonths: 12,
    sourceUrl: "https://lian-li.com/product/o11-dynamic-evo/",
    specs: {
      motherboardFormFactors: ["E_ATX", "ATX", "MICRO_ATX", "MINI_ITX"],
      maxGpuLengthMm: 426,
      maxCoolerHeightMm: 167,
      // Top 280/360, side 280/360, bottom 360
      radiatorSizesMm: [280, 360],
      psuFormFactors: ["ATX"],
    },
  },
] satisfies SeedPart<"case">[]
