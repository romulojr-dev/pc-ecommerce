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
  {
    sku: "DUAL-RTX5050-O8G",
    name: "ASUS Dual GeForce RTX 5050 OC Edition 8GB",
    brand: "ASUS",
    price: 1549500, // budget
    stock: 14,
    weightGrams: 900, // estimate; not on the ASUS page
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Speedsetup manual", "Thank you card"],
    sourceUrl:
      "https://www.asus.com/motherboards-components/graphics-cards/dual/dual-rtx5050-o8g/techspec/",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5050",
      vramGb: 8,
      lengthMm: 203,
      boardPowerW: 130, // NVIDIA reference TGP
    },
  },
  {
    sku: "GeForce RTX 5060 8G VENTUS 2X OC",
    name: "MSI GeForce RTX 5060 8G Ventus 2X OC",
    brand: "MSI",
    price: 1949500, // budget
    salePrice: 1799500,
    stock: 18,
    weightGrams: 829, // package weight from MSI
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Quick user guide"],
    sourceUrl:
      "https://storage-asset.msi.com/datasheet/vga/global/GeForce-RTX-5060-8G-VENTUS-2X-OC.pdf",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5060",
      vramGb: 8,
      lengthMm: 197,
      boardPowerW: 145,
    },
  },
  {
    sku: "DUAL-RTX5060-O8G",
    name: "ASUS Dual GeForce RTX 5060 OC Edition 8GB",
    brand: "ASUS",
    price: 2199500, // mid
    stock: 11,
    weightGrams: 1000, // estimate; not on the ASUS page
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Speedsetup manual", "Thank you card"],
    sourceUrl:
      "https://www.asus.com/us/motherboards-components/graphics-cards/dual/dual-rtx5060-o8g/techspec/",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5060",
      vramGb: 8,
      lengthMm: 228,
      boardPowerW: 145, // NVIDIA reference TGP
    },
  },
  {
    sku: "DUAL-RTX5060TI-8G",
    name: "ASUS Dual GeForce RTX 5060 Ti 8GB",
    brand: "ASUS",
    price: 2399500, // mid
    stock: 9,
    weightGrams: 1100, // estimate; not on the ASUS page
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Speedsetup manual", "Thank you card"],
    sourceUrl:
      "https://www.asus.com/motherboards-components/graphics-cards/dual/dual-rtx5060ti-8g/techspec/",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5060 Ti",
      vramGb: 8,
      lengthMm: 229,
      boardPowerW: 180, // NVIDIA reference TGP
    },
  },
  {
    sku: "PRIME-RTX5070-O12G",
    name: "ASUS Prime GeForce RTX 5070 OC Edition 12GB",
    brand: "ASUS",
    price: 3999500, // mid
    stock: 7,
    weightGrams: 1700, // estimate; not on the ASUS page
    warrantyMonths: 36,
    boxContents: [
      "Graphics card",
      "Adapter cable (1 to 2)",
      "Velcro hook-and-loop strap",
      "Speedsetup manual",
      "Thank you card",
    ],
    sourceUrl:
      "https://www.asus.com/us/motherboards-components/graphics-cards/prime/prime-rtx5070-o12g/techspec/",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5070",
      vramGb: 12,
      lengthMm: 304,
      boardPowerW: 250, // NVIDIA reference TGP
    },
  },
  {
    sku: "GeForce RTX 5070 12G VENTUS 3X OC",
    name: "MSI GeForce RTX 5070 12G Ventus 3X OC",
    brand: "MSI",
    price: 3849500, // mid
    stock: 12,
    weightGrams: 1440, // package weight from MSI
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Quick user guide"],
    sourceUrl:
      "https://storage-asset.msi.com/datasheet/vga/global/GeForce-RTX-5070-12G-VENTUS-3X-OC.pdf",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5070",
      vramGb: 12,
      lengthMm: 302,
      boardPowerW: 250,
    },
  },
  {
    sku: "PRIME-RTX5070TI-O16G",
    name: "ASUS Prime GeForce RTX 5070 Ti OC Edition 16GB",
    brand: "ASUS",
    price: 5799500, // high
    stock: 6,
    weightGrams: 1800, // estimate; not on the ASUS page
    warrantyMonths: 36,
    boxContents: [
      "Graphics card",
      "Adapter cable (1 to 3)",
      "Velcro hook-and-loop strap",
      "Speedsetup manual",
      "Thank you card",
    ],
    sourceUrl:
      "https://www.asus.com/us/motherboards-components/graphics-cards/prime/prime-rtx5070ti-o16g/techspec/",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5070 Ti",
      vramGb: 16,
      lengthMm: 304,
      boardPowerW: 300, // NVIDIA reference TGP
    },
  },
  {
    sku: "GeForce RTX 5070 Ti 16G VENTUS 3X OC",
    name: "MSI GeForce RTX 5070 Ti 16G Ventus 3X OC",
    brand: "MSI",
    price: 5999500, // high
    stock: 0, // out of stock
    weightGrams: 1566, // package weight from MSI
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Quick user guide"],
    sourceUrl:
      "https://storage-asset.msi.com/datasheet/vga/global/GeForce-RTX-5070-Ti-16G-VENTUS-3X-OC.pdf",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5070 Ti",
      vramGb: 16,
      lengthMm: 303,
      boardPowerW: 300,
    },
  },
  {
    sku: "GeForce RTX 5080 16G GAMING TRIO OC",
    name: "MSI GeForce RTX 5080 16G Gaming Trio OC",
    brand: "MSI",
    price: 8499500, // high
    stock: 8,
    weightGrams: 1885, // package weight from MSI
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Quick user guide"],
    sourceUrl:
      "https://storage-asset.msi.com/datasheet/vga/global/GeForce-RTX-5080-16G-GAMING-TRIO-OC.pdf",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5080",
      vramGb: 16,
      lengthMm: 338,
      boardPowerW: 360,
    },
  },
  {
    sku: "GeForce RTX 5090 32G GAMING TRIO OC",
    name: "MSI GeForce RTX 5090 32G Gaming Trio OC",
    brand: "MSI",
    price: 16999500, // high
    stock: 6,
    weightGrams: 2735, // package weight from MSI
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Quick user guide"],
    sourceUrl:
      "https://storage-asset.msi.com/datasheet/vga/global/GeForce-RTX-5090-32G-GAMING-TRIO-OC.pdf",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 5090",
      vramGb: 32,
      lengthMm: 359,
      boardPowerW: 575, // MSI recommends a 1000 W PSU
    },
  },
  {
    sku: "GeForce RTX 4070 SUPER 12G VENTUS 2X OC",
    name: "MSI GeForce RTX 4070 Super 12G Ventus 2X OC",
    brand: "MSI",
    price: 3699500, // mid
    stock: 2, // low stock
    weightGrams: 998, // package weight from MSI
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Quick user guide"],
    sourceUrl:
      "https://storage-asset.msi.com/datasheet/vga/global/GeForce-RTX-4070-SUPER-12G-VENTUS-2X-OC.pdf",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 4070 Super",
      vramGb: 12,
      lengthMm: 242,
      boardPowerW: 220,
    },
  },
  {
    sku: "DUAL-RTX3060-O12G-V2",
    name: "ASUS Dual GeForce RTX 3060 V2 OC Edition 12GB",
    brand: "ASUS",
    price: 1599500, // budget
    stock: 0, // out of stock
    weightGrams: 1000, // estimate; not on the ASUS page
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Speedsetup manual", "Collection card"],
    sourceUrl:
      "https://www.asus.com/motherboards-components/graphics-cards/dual/dual-rtx3060-o12g-v2/techspec/",
    specs: {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 3060",
      vramGb: 12,
      lengthMm: 200, // 20 cm
      boardPowerW: 170, // NVIDIA reference TGP
    },
  },
  {
    sku: "11339-04-20G",
    name: "Sapphire PULSE Radeon RX 7600 XT 16GB",
    brand: "Sapphire",
    price: 1849500, // budget
    stock: 10,
    weightGrams: 1100, // estimate; not on the Sapphire page
    warrantyMonths: 24,
    boxContents: ["Graphics card", "Quick installation guide"],
    sourceUrl:
      "https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-7600-xt-16g-gddr6",
    specs: {
      chipsetBrand: "AMD",
      chipset: "Radeon RX 7600 XT",
      vramGb: 16,
      lengthMm: 250,
      boardPowerW: 192, // Sapphire's figure
    },
  },
  {
    sku: "11330-02-20G",
    name: "Sapphire PULSE Radeon RX 7800 XT 16GB",
    brand: "Sapphire",
    price: 3199500, // mid
    salePrice: 2799500,
    stock: 8,
    weightGrams: 1500, // estimate; not on the Sapphire page
    warrantyMonths: 24,
    boxContents: ["Graphics card", "Quick installation guide"],
    sourceUrl:
      "https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-7800-xt-16g-gddr6",
    specs: {
      chipsetBrand: "AMD",
      chipset: "Radeon RX 7800 XT",
      vramGb: 16,
      lengthMm: 280,
      boardPowerW: 266, // Sapphire's figure; AMD reference is 263 W
    },
  },
  {
    sku: "11322-02-20G",
    name: "Sapphire PULSE Radeon RX 7900 XTX 24GB",
    brand: "Sapphire",
    price: 6299500, // high
    stock: 7,
    weightGrams: 2200, // estimate; not on the Sapphire page
    warrantyMonths: 24,
    boxContents: ["Graphics card", "Graphics card supporter"],
    sourceUrl:
      "https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-7900-xtx-24g-gddr6",
    specs: {
      chipsetBrand: "AMD",
      chipset: "Radeon RX 7900 XTX",
      vramGb: 24,
      lengthMm: 313,
      boardPowerW: 370, // Sapphire's figure; AMD reference is 355 W
    },
  },
  {
    sku: "11350-04-20G",
    name: "Sapphire PULSE Radeon RX 9060 XT OC 8GB",
    brand: "Sapphire",
    price: 1999500, // budget
    stock: 15,
    weightGrams: 1000, // estimate; not on the Sapphire page
    warrantyMonths: 24,
    boxContents: ["Graphics card", "Quick installation guide"],
    sourceUrl:
      "https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-9060-xt-8g-gddr6",
    specs: {
      chipsetBrand: "AMD",
      chipset: "Radeon RX 9060 XT",
      vramGb: 8,
      lengthMm: 244,
      boardPowerW: 170, // typical board power
    },
  },
  {
    sku: "PRIME-RX9060XT-O16G",
    name: "ASUS Prime Radeon RX 9060 XT OC Edition 16GB",
    brand: "ASUS",
    price: 2549500, // mid
    stock: 9,
    weightGrams: 1500, // estimate; not on the ASUS page
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Speedsetup manual", "Thank you card"],
    sourceUrl:
      "https://www.asus.com/motherboards-components/graphics-cards/prime/prime-rx9060xt-o16g/techspec/",
    specs: {
      chipsetBrand: "AMD",
      chipset: "Radeon RX 9060 XT",
      vramGb: 16,
      lengthMm: 304,
      boardPowerW: 160, // AMD reference TBP
    },
  },
  {
    sku: "PRIME-RX9070-O16G",
    name: "ASUS Prime Radeon RX 9070 OC Edition 16GB",
    brand: "ASUS",
    price: 4099500, // mid
    stock: 10,
    weightGrams: 1800, // estimate; not on the ASUS page
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Speedsetup manual", "Thank you card"],
    preorderShipsOn: "2027-02-12", // pre-order
    sourceUrl:
      "https://www.asus.com/motherboards-components/graphics-cards/prime/prime-rx9070-o16g/techspec/",
    specs: {
      chipsetBrand: "AMD",
      chipset: "Radeon RX 9070",
      vramGb: 16,
      lengthMm: 312,
      boardPowerW: 220, // AMD reference TBP
    },
  },
  {
    sku: "11348-01-20G",
    name: "Sapphire NITRO+ Radeon RX 9070 XT OC 16GB",
    brand: "Sapphire",
    price: 5499500, // high
    stock: 8,
    weightGrams: 2400, // estimate; not on the Sapphire page
    warrantyMonths: 24,
    boxContents: [
      "Graphics card",
      "L-shape support bracket",
      "3-pin 5V ARGB cable",
      "Magnetic backplate",
      "12V-2x6 to 3× 8-pin power adapter",
    ],
    sourceUrl:
      "https://www.sapphiretech.com/en/consumer/nitro-radeon-rx-9070-xt-16g-gddr6",
    specs: {
      chipsetBrand: "AMD",
      chipset: "Radeon RX 9070 XT",
      vramGb: 16,
      lengthMm: 331, // 330.8 mm
      boardPowerW: 330, // typical board power
    },
  },
  {
    sku: "21P02J00BAG",
    name: "Intel Arc A750 Limited Edition 8GB",
    brand: "Intel",
    price: 1199500, // budget
    stock: 7,
    weightGrams: 1100, // estimate; not on the Intel page
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Quick start guide"],
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/227954/intel-arc-a750-graphics/specifications.html",
    specs: {
      chipsetBrand: "INTEL",
      chipset: "Arc A750",
      vramGb: 8,
      // 279.9 mm with the I/O bracket (Intel support article 000092554)
      lengthMm: 280,
      boardPowerW: 225,
    },
  },
  {
    sku: "21P01J00BA",
    name: "Intel Arc A770 Limited Edition 16GB",
    brand: "Intel",
    price: 1799500, // budget
    stock: 4, // low stock
    weightGrams: 1100, // estimate; not on the Intel page
    warrantyMonths: 36,
    boxContents: ["Graphics card", "Quick start guide"],
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/229151/intel-arc-a770-graphics-16gb/specifications.html",
    specs: {
      chipsetBrand: "INTEL",
      chipset: "Arc A770",
      vramGb: 16,
      // 279.9 mm with the I/O bracket (Intel support article 000092554)
      lengthMm: 280,
      boardPowerW: 225,
    },
  },
] satisfies SeedPart<"gpu">[]
