import type { SeedPart } from "../part-schema"

// lengthMm is rounded up from the manufacturer's figure. Prices are
// approximate PH retail, in centavos.
export const gpus = [
  {
    sku: "DUAL-RTX4060-O8G",
    name: "ASUS Dual GeForce RTX 4060 OC Edition 8GB",
    brand: "ASUS",
    price: 1799500,
    stock: 10,
    weightGrams: 1100,
    warrantyMonths: 36,
    sourceUrl:
      "https://www.asus.com/motherboards-components/graphics-cards/dual/dual-rtx4060-o8g/techspec/",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 4060",
      vramGb: 8,
      lengthMm: 228, // 227.2 mm
      boardPowerW: 115,
    },
  },
  {
    sku: "GV-N5070WF3OC-12GD",
    name: "Gigabyte GeForce RTX 5070 Windforce OC SFF 12G",
    brand: "Gigabyte",
    price: 3699500,
    stock: 6,
    weightGrams: 1300,
    warrantyMonths: 36,
    sourceUrl: "https://www.gigabyte.com/Graphics-Card/GV-N5070WF3OC-12GD/sp",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5070",
      vramGb: 12,
      lengthMm: 282,
      boardPowerW: 250,
    },
  },
  {
    sku: "ROG-ASTRAL-RTX5090-O32G-GAMING",
    name: "ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB",
    brand: "ASUS",
    price: 17999500,
    stock: 0, // out of stock, for "Out of stock" and in-stock filters
    weightGrams: 3600,
    warrantyMonths: 36,
    sourceUrl:
      "https://rog.asus.com/graphics-cards/graphics-cards/rog-astral/rog-astral-rtx5090-o32g-gaming/spec/",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5090",
      vramGb: 32,
      lengthMm: 358, // 357.6 mm
      boardPowerW: 575, // NVIDIA reference TGP; ASUS recommends a 1000 W PSU
    },
  },
] satisfies SeedPart<"gpu">[]
