import { placeholderUrl } from "@/lib/placeholders"

import type { SeedPart } from "../part-schema"

// lengthMm is rounded up from the manufacturer's figure. Prices are sample
// PH retail prices, in centavos. Tiers: budget under ₱20,000, mid
// ₱20,000–₱49,999, high ₱50,000+.
export const gpus = [
  {
    sku: "DUAL-RTX4060-O8G",
    name: "ASUS Dual GeForce RTX 4060 OC Edition 8GB",
    brand: "ASUS",
    price: 1799500, // budget
    stock: 10,
    weightGrams: 1100,
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Collection card", "Quick start guide"],
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
    price: 3699500, // mid
    stock: 6,
    weightGrams: 1300,
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Quick installation guide"],
    sourceUrl: "https://www.gigabyte.com/Graphics-Card/GV-N5070WF3OC-12GD/sp",
    // Several images, for the product gallery (spec 006)
    images: [
      { url: placeholderUrl("gpu") },
      { url: placeholderUrl("box") },
      { url: placeholderUrl("detail") },
    ],
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
    price: 17999500, // high
    stock: 0, // out of stock, for "Out of stock" and in-stock filters
    weightGrams: 3600,
    warrantyMonths: 36,
    boxContents: [
      "Graphics card",
      "16-pin to 4× 8-pin power adapter",
      "Graphics card holder",
      "Hook-and-loop cable tie",
      "Quick start guide",
    ],
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
  {
    sku: "GV-N3050OC-6GL",
    name: "Gigabyte GeForce RTX 3050 OC Low Profile 6G",
    brand: "Gigabyte",
    price: 1099500, // budget
    stock: 12,
    weightGrams: 700,
    warrantyMonths: 36,
    boxContents: [
      "Graphics card",
      "Low-profile bracket",
      "Quick installation guide",
    ],
    sourceUrl: "https://www.gigabyte.com/Graphics-Card/GV-N3050OC-6GL/sp",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 3050",
      vramGb: 6,
      lengthMm: 181, // low profile, no power connector
      // NVIDIA reference TGP
      boardPowerW: 70,
    },
  },
  {
    sku: "31P06HB0BA",
    name: "Intel Arc B580 Limited Edition 12GB",
    brand: "Intel",
    price: 1599500, // budget
    stock: 8,
    weightGrams: 1100,
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Quick start guide"],
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/241598/intel-arc-b580-graphics/specifications.html",
    specs: {
      chipsetBrand: "INTEL",
      chipset: "Arc B580",
      vramGb: 12,
      lengthMm: 272,
      boardPowerW: 190,
    },
  },
  {
    sku: "11324-01-20G",
    name: "Sapphire PULSE Radeon RX 7600 8GB",
    brand: "Sapphire",
    price: 1649500, // budget
    salePrice: 1499500,
    stock: 9,
    weightGrams: 1000,
    warrantyMonths: 24,
    boxContents: ["Graphics card", "Quick installation guide"],
    sourceUrl:
      "https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-7600-8g-gddr6",
    specs: {
      chipsetBrand: "AMD",
      chipset: "Radeon RX 7600",
      vramGb: 8,
      lengthMm: 240,
      boardPowerW: 185, // Sapphire's figure; AMD reference is 165 W
    },
  },
  {
    sku: "GeForce RTX 5060 Ti 16G VENTUS 2X OC PLUS",
    name: "MSI GeForce RTX 5060 Ti 16G Ventus 2X OC Plus",
    brand: "MSI",
    price: 2799500, // mid
    stock: 10,
    weightGrams: 862, // package weight from MSI
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Quick user guide"],
    preorderShipsOn: "2027-01-15", // pre-order, for "Pre-order" states
    sourceUrl:
      "https://www.msi.com/Graphics-Card/GeForce-RTX-5060-Ti-16G-VENTUS-2X-OC-PLUS/Specification",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5060 Ti",
      vramGb: 16,
      lengthMm: 227,
      boardPowerW: 180,
    },
  },
  {
    sku: "11348-03-20G",
    name: "Sapphire PULSE Radeon RX 9070 XT 16GB",
    brand: "Sapphire",
    price: 4499500, // mid
    stock: 3, // low stock
    weightGrams: 1800,
    warrantyMonths: 24,
    boxContents: [
      "Graphics card",
      "Graphics card support bracket",
      "Quick installation guide",
    ],
    sourceUrl:
      "https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-9070-xt-16g-gddr6",
    specs: {
      chipsetBrand: "AMD",
      chipset: "Radeon RX 9070 XT",
      vramGb: 16,
      lengthMm: 320,
      boardPowerW: 304, // typical board power
    },
  },
  {
    sku: "TUF-RTX5080-O16G-GAMING",
    name: "ASUS TUF Gaming GeForce RTX 5080 OC Edition 16GB",
    brand: "ASUS",
    price: 7299500, // high
    stock: 0, // out of stock
    weightGrams: 2600,
    warrantyMonths: 36,
    boxContents: [
      "Graphics card",
      "16-pin to 3× 8-pin power adapter",
      "Graphics card holder",
      "Quick start guide",
    ],
    sourceUrl:
      "https://www.asus.com/ea-sw/motherboards-components/graphics-cards/tuf-gaming/tuf-rtx5080-o16g-gaming/techspec/",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5080",
      vramGb: 16,
      lengthMm: 348,
      // NVIDIA reference TGP
      boardPowerW: 360,
    },
  },
] satisfies SeedPart<"gpu">[]
