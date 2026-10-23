import type { SeedPart } from "../part-schema"

// Clearances are rounded down from the manufacturer's figure. Radiator sizes
// are the union across mounting positions. Prices are approximate PH retail,
// in centavos.
export const cases = [
  {
    sku: "LAN216X",
    name: "Lian Li LANCOOL 216 Black",
    brand: "Lian Li",
    price: 579500,
    stock: 7,
    weightGrams: 9000,
    warrantyMonths: 12,
    sourceUrl: "https://lian-li.com/product/lancool-216/",
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
    price: 299500,
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
    price: 699500,
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
] satisfies SeedPart<"case">[]
