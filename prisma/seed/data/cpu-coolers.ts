import { placeholderUrl } from "@/lib/placeholders"

import type { SeedPart } from "../part-schema"

// heightMm (air coolers) is rounded up from the manufacturer's figure.
// Prices are sample PH retail prices, in centavos. Tiers: budget under
// ₱2,500, mid ₱2,500–₱6,499, high ₱6,500+.
export const cpuCoolers = [
  {
    sku: "PA120 SE",
    name: "Thermalright Peerless Assassin 120 SE",
    brand: "Thermalright",
    price: 229500, // budget
    stock: 20,
    weightGrams: 1300,
    warrantyMonths: 36,
    sourceUrl: "https://www.thermalright.com/product/peerless-assassin-120-se/",
    specs: {
      type: "AIR",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      heightMm: 155,
    },
  },
  {
    sku: "NH-L9a-AM5",
    name: "Noctua NH-L9a-AM5 Low-Profile Cooler",
    brand: "Noctua",
    price: 329500, // mid
    stock: 6,
    weightGrams: 450,
    warrantyMonths: 72,
    sourceUrl: "https://noctua.at/en/nh-l9a-am5/specification",
    specs: {
      type: "AIR",
      supportedSockets: ["AM5"],
      heightMm: 37,
    },
  },
  {
    sku: "ACFRE00136A",
    name: "Arctic Liquid Freezer III 360",
    brand: "Arctic",
    price: 599500, // mid
    stock: 7,
    weightGrams: 2200,
    warrantyMonths: 72,
    sourceUrl: "https://www.arctic.de/en/Liquid-Freezer-III-360/ACFRE00136A",
    specs: {
      type: "AIO",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      radiatorSizeMm: 360,
    },
  },
  {
    sku: "SE-224-XT ARGB V3",
    name: "ID-COOLING SE-224-XT ARGB V3",
    brand: "ID-COOLING",
    price: 149500, // budget
    stock: 25,
    weightGrams: 900,
    warrantyMonths: 24,
    sourceUrl:
      "https://www.idcooling.com/product/detail?id=278&name=SE-224-XT+ARGB+V3",
    specs: {
      type: "AIR",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      heightMm: 153,
    },
  },
  {
    sku: "R-AK400-BKNNMN-G-1",
    name: "DeepCool AK400",
    brand: "DeepCool",
    price: 189500, // budget
    salePrice: 169500,
    stock: 18,
    weightGrams: 900,
    warrantyMonths: 36,
    sourceUrl:
      "https://uk.deepcool.com/products/Cooling/cpuaircoolers/AK400-Performance-CPU-Cooler-1851-1700-AM5/2024/15343.shtml",
    specs: {
      type: "AIR",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      heightMm: 155,
    },
  },
  {
    sku: "NH-D15 G2",
    name: "Noctua NH-D15 G2",
    brand: "Noctua",
    price: 849500, // high
    stock: 5, // low stock
    weightGrams: 2200,
    warrantyMonths: 72,
    sourceUrl: "https://www.noctua.at/en/products/nh-d15-g2/specifications",
    // Several images, for the product gallery (spec 006)
    images: [
      { url: placeholderUrl("cpu-cooler") },
      { url: placeholderUrl("box") },
      { url: placeholderUrl("detail") },
    ],
    // 168 mm: too tall for the Q300L (157) and the AIR 100 (161)
    specs: {
      type: "AIR",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      heightMm: 168,
    },
  },
  {
    sku: "RL-KN240-B1",
    name: "NZXT Kraken 240",
    brand: "NZXT",
    price: 699500, // high
    stock: 9,
    weightGrams: 1800,
    warrantyMonths: 72,
    sourceUrl: "https://nzxt.com/ja-intl/products/kraken-240",
    specs: {
      type: "AIO",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      radiatorSizeMm: 240,
    },
  },
] satisfies SeedPart<"cpu-cooler">[]
